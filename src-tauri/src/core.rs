//! `AppCore` holds every manager and wires the global input listener's single
//! consumer (hotkeys + recorder feed + corner failsafe). See SPEC §4.

use std::sync::mpsc::Receiver;
use std::sync::{Arc, Mutex};
use std::thread;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tokio::runtime::Runtime;

use crate::engine::autoclick::{AutoClickOpts, AutoClickSink, AutoClicker};
use crate::engine::color_trigger::{ColorTrigger, ColorTriggerOpts, TriggerSink};
use crate::engine::failsafe::{is_at_corner, within};
use crate::engine::hotkeys::HotkeyManager;
use crate::engine::player::{PlaybackSink, Player};
use crate::engine::recorder::Recorder;
use crate::engine::scheduler::Scheduler;
use crate::input::backend::InputBackend;
use crate::input::cursor::CursorTracker;
use crate::input::listener::RawInput;
use crate::ipc::events::{
    names, AppState, HotkeyAction, HotkeyTriggered, PlaybackFinished, PlaybackProgress,
    RecordingEventAdded, StatusChanged,
};
use crate::model::{KeyAction, Macro, Monitor, PlaybackOpts, RecordOpts, Settings};

/// What the global Play/Stop hotkey (F6) should start when nothing is running.
/// The frontend pushes this whenever the active mode/data changes, so F6 works
/// even when the window is minimized (the webview is suspended; Rust isn't).
#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum PlayIntent {
    None,
    Macro { mac: Macro, opts: PlaybackOpts },
    Autoclick { opts: AutoClickOpts },
    Color { opts: ColorTriggerOpts },
}

/// Drag-to-select-region capture state. While active, the next mouse press→release
/// captures a screen rectangle (in true screen pixels via the global listener).
#[derive(Default)]
pub struct RegionCapture {
    pub active: bool,
    pub start: Option<(i32, i32)>,
}

#[derive(Clone)]
pub struct AppCore {
    pub backend: Arc<dyn InputBackend>,
    pub cursor: Arc<CursorTracker>,
    pub player: Arc<Player>,
    pub recorder: Arc<Recorder>,
    pub hotkeys: Arc<HotkeyManager>,
    pub color_trigger: Arc<ColorTrigger>,
    pub autoclicker: Arc<AutoClicker>,
    pub scheduler: Arc<Scheduler>,
    pub settings: Arc<Mutex<Settings>>,
    pub status: Arc<Mutex<AppState>>,
    pub monitors: Arc<Mutex<Vec<Monitor>>>,
    pub record_opts: Arc<Mutex<RecordOpts>>,
    pub play_intent: Arc<Mutex<PlayIntent>>,
    /// Latest auto-click options, pushed by the UI so the auto-click hotkey (F6)
    /// can start the clicker even while the window is minimized.
    pub autoclick_opts: Arc<Mutex<Option<AutoClickOpts>>>,
    pub region_capture: Arc<Mutex<RegionCapture>>,
    pub rt: Arc<Runtime>,
}

impl AppCore {
    pub fn new(app: AppHandle, cursor: Arc<CursorTracker>, settings: Settings) -> Self {
        let backend = crate::input::make_backend();
        let player = Arc::new(Player::new(Arc::clone(&backend)));
        let recorder = Arc::new(Recorder::new());
        let hotkeys = Arc::new(HotkeyManager::new(settings.hotkeys.clone()));
        let color_trigger = Arc::new(ColorTrigger::new(Arc::clone(&backend)));
        let autoclicker = Arc::new(AutoClicker::new(Arc::clone(&backend)));
        let status = Arc::new(Mutex::new(AppState::Idle));
        let monitors = Arc::new(Mutex::new(current_monitors(&app)));
        let rt = Arc::new(
            tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .build()
                .expect("tokio runtime"),
        );

        // Scheduler fires by starting a playback (its in-progress run is a
        // playback, so panic cancels it). on_fire captures only what it needs.
        let on_fire = {
            let player = Arc::clone(&player);
            let monitors = Arc::clone(&monitors);
            let status = Arc::clone(&status);
            let app = app.clone();
            Arc::new(move |macro_: Macro, opts: PlaybackOpts| {
                start_playback_with(&player, &monitors, &status, &app, macro_, opts);
            }) as Arc<dyn Fn(Macro, PlaybackOpts) + Send + Sync>
        };
        let scheduler = Arc::new(Scheduler::new(rt.handle().clone(), on_fire));

        Self {
            backend,
            cursor,
            player,
            recorder,
            hotkeys,
            color_trigger,
            autoclicker,
            scheduler,
            settings: Arc::new(Mutex::new(settings)),
            status,
            monitors,
            record_opts: Arc::new(Mutex::new(RecordOpts::default())),
            play_intent: Arc::new(Mutex::new(PlayIntent::None)),
            autoclick_opts: Arc::new(Mutex::new(None)),
            region_capture: Arc::new(Mutex::new(RegionCapture::default())),
            rt,
        }
    }

    /// Toggle recording entirely in Rust (so F9 works when the window is
    /// minimized). Uses the last record options pushed by the frontend.
    pub fn toggle_record(&self, app: &AppHandle) {
        if self.recorder.is_active() {
            let monitors = current_monitors(app);
            let m = self.recorder.stop("Recorded macro", monitors);
            self.set_status(app, AppState::Idle);
            let _ = app.emit(
                names::RECORDING_STOPPED,
                crate::ipc::events::RecordingStopped { macro_: m },
            );
        } else {
            let opts = *self.record_opts.lock().unwrap();
            self.recorder.start(opts);
            self.set_status(app, AppState::Recording);
        }
    }

    /// Execute the cached play intent (F8 when nothing is running).
    pub fn play_intent(&self, app: &AppHandle) {
        let intent = self.play_intent.lock().unwrap().clone();
        match intent {
            PlayIntent::Macro { mac, opts } => self.start_playback(app, mac, opts),
            PlayIntent::Autoclick { opts } => self.start_autoclick(app, opts),
            PlayIntent::Color { opts } => self.start_color_trigger(app, opts),
            PlayIntent::None => {}
        }
    }

    pub fn anything_running(&self) -> bool {
        self.player.is_playing() || self.color_trigger.is_running() || self.autoclicker.is_running()
    }

    pub fn set_status(&self, app: &AppHandle, state: AppState) {
        *self.status.lock().unwrap() = state;
        let _ = app.emit(names::STATUS_CHANGED, StatusChanged { state });
    }

    pub fn refresh_monitors(&self, app: &AppHandle) -> Vec<Monitor> {
        let m = current_monitors(app);
        *self.monitors.lock().unwrap() = m.clone();
        m
    }

    pub fn start_playback(&self, app: &AppHandle, macro_: Macro, opts: PlaybackOpts) {
        start_playback_with(
            &self.player,
            &self.monitors,
            &self.status,
            app,
            macro_,
            opts,
        );
    }

    pub fn start_color_trigger(&self, app: &AppHandle, opts: ColorTriggerOpts) {
        self.set_status(app, AppState::Playing);
        let sink = Arc::new(TriggerTauriSink {
            app: app.clone(),
            status: Arc::clone(&self.status),
        });
        self.color_trigger.start(opts, sink);
    }

    pub fn start_autoclick(&self, app: &AppHandle, opts: AutoClickOpts) {
        let monitors = self.refresh_monitors(app);
        self.set_status(app, AppState::Playing);
        let sink = Arc::new(AutoClickTauriSink {
            app: app.clone(),
            status: Arc::clone(&self.status),
        });
        self.autoclicker.start_with(opts, monitors, sink);
    }

    /// Hard stop everything user-initiated (Stop button).
    pub fn stop_all(&self) {
        self.player.stop();
        self.color_trigger.stop();
        self.autoclicker.stop();
    }
}

/// Map Tauri's monitor list into our physical-pixel `Monitor` model (SPEC §7).
pub fn current_monitors(app: &AppHandle) -> Vec<Monitor> {
    let Some(win) = app.get_webview_window("main") else {
        return Vec::new();
    };
    let Ok(list) = win.available_monitors() else {
        return Vec::new();
    };
    list.into_iter()
        .enumerate()
        .map(|(i, m)| {
            let scale = m.scale_factor();
            let pos = m.position();
            let size = m.size();
            // enigo (playback) and rdev (recording) operate in the OS input-event
            // coordinate space. On Windows (per-monitor DPI-aware) that space is
            // physical pixels; on macOS it is logical *points* (the CGEvent global
            // space). We store every engine coordinate in that space so clicks,
            // multi-monitor clamping and the corner failsafe all agree with the
            // input layer — so on macOS we convert Tauri's physical monitor bounds
            // down to points. (See input/coords.rs; verified on a single Retina
            // display — the multi-monitor point-origin mapping is untested.)
            #[cfg(target_os = "macos")]
            let (x, y, w, h) = {
                let lp = pos.to_logical::<f64>(scale);
                let ls = size.to_logical::<f64>(scale);
                (
                    lp.x.round() as i32,
                    lp.y.round() as i32,
                    ls.width.round() as i32,
                    ls.height.round() as i32,
                )
            };
            #[cfg(not(target_os = "macos"))]
            let (x, y, w, h) = (pos.x, pos.y, size.width as i32, size.height as i32);
            Monitor {
                id: i as u32,
                x,
                y,
                w,
                h,
                scale,
            }
        })
        .collect()
}

fn start_playback_with(
    player: &Arc<Player>,
    monitors: &Arc<Mutex<Vec<Monitor>>>,
    status: &Arc<Mutex<AppState>>,
    app: &AppHandle,
    macro_: Macro,
    opts: PlaybackOpts,
) {
    let mons = current_monitors(app);
    *monitors.lock().unwrap() = mons.clone();
    let effective_monitors = if mons.is_empty() {
        macro_.monitors.clone()
    } else {
        mons
    };
    *status.lock().unwrap() = AppState::Playing;
    let _ = app.emit(
        names::STATUS_CHANGED,
        StatusChanged {
            state: AppState::Playing,
        },
    );
    let sink = Arc::new(TauriSink {
        app: app.clone(),
        status: Arc::clone(status),
    });
    player.play(macro_, opts, effective_monitors, sink);
}

// ── Event sinks ────────────────────────────────────────────────────

struct TauriSink {
    app: AppHandle,
    status: Arc<Mutex<AppState>>,
}

impl PlaybackSink for TauriSink {
    fn progress(&self, p: PlaybackProgress) {
        let _ = self.app.emit(names::PLAYBACK_PROGRESS, p);
    }
    fn finished(&self, f: PlaybackFinished) {
        let _ = self.app.emit(names::PLAYBACK_FINISHED, f);
        *self.status.lock().unwrap() = AppState::Idle;
        let _ = self.app.emit(
            names::STATUS_CHANGED,
            StatusChanged {
                state: AppState::Idle,
            },
        );
    }
}

struct TriggerTauriSink {
    app: AppHandle,
    status: Arc<Mutex<AppState>>,
}

impl TriggerSink for TriggerTauriSink {
    fn clicked(&self, total: u32, _x: i32, _y: i32) {
        let _ = self.app.emit(
            names::PLAYBACK_PROGRESS,
            PlaybackProgress {
                loop_index: total,
                event_index: 0,
                total_events: 0,
                total_loops: None,
            },
        );
    }
    fn finished(&self, total: u32, panicked: bool) {
        emit_live_finished(&self.app, &self.status, total, panicked);
    }
}

struct AutoClickTauriSink {
    app: AppHandle,
    status: Arc<Mutex<AppState>>,
}

impl AutoClickSink for AutoClickTauriSink {
    fn clicked(&self, total: u32) {
        let _ = self.app.emit(
            names::PLAYBACK_PROGRESS,
            PlaybackProgress {
                loop_index: total,
                event_index: 0,
                total_events: 0,
                total_loops: None,
            },
        );
    }
    fn finished(&self, total: u32, panicked: bool) {
        emit_live_finished(&self.app, &self.status, total, panicked);
    }
}

/// Shared finish handling for the live tools (color trigger + autoclicker).
fn emit_live_finished(app: &AppHandle, status: &Arc<Mutex<AppState>>, total: u32, panicked: bool) {
    let _ = app.emit(
        names::PLAYBACK_FINISHED,
        PlaybackFinished {
            loops_completed: total,
            reason: if panicked {
                crate::ipc::events::FinishReason::Panic
            } else {
                crate::ipc::events::FinishReason::Stopped
            },
        },
    );
    *status.lock().unwrap() = AppState::Idle;
    let _ = app.emit(
        names::STATUS_CHANGED,
        StatusChanged {
            state: AppState::Idle,
        },
    );
}

// ── Listener consumer ──────────────────────────────────────────────

/// Spawn the single consumer of global input events: feeds the recorder,
/// matches hotkeys, and runs the corner failsafe. Latency-critical aborts
/// (panic key, corner slam) happen here in Rust; record/play/capture toggles
/// are forwarded to the UI so it can act with the current macro/opts in hand.
pub fn start_consumer(core: AppCore, app: AppHandle, rx: Receiver<RawInput>) {
    thread::Builder::new()
        .name("input-consumer".into())
        .spawn(move || {
            // This thread owns the stop hotkeys (F6/F12) + corner failsafe. It
            // must never die, or the user can get stuck under a running clicker.
            // Contain any per-event panic so the kill switch stays alive (in
            // release, panic=abort kills the process instead — also safe).
            for raw in rx.iter() {
                let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    process_event(&core, &app, &raw);
                }));
                if res.is_err() {
                    eprintln!(
                        "input-consumer: recovered from a panic; hotkeys/failsafe stay alive"
                    );
                }
            }
        })
        .expect("failed to spawn input-consumer thread");
}

fn process_event(core: &AppCore, app: &AppHandle, raw: &RawInput) {
    // 0) Drag-to-select region capture. While active, a real mouse press→release
    //    defines a screen rectangle (cursor positions are true screen pixels);
    //    all input is consumed so the drag doesn't click/record anything.
    {
        let mut rc = core.region_capture.lock().unwrap();
        if rc.active {
            match raw {
                RawInput::Button {
                    action: KeyAction::Press,
                    ..
                } => {
                    rc.start = Some(core.cursor.get());
                    return;
                }
                RawInput::Button {
                    action: KeyAction::Release,
                    ..
                } => {
                    if let Some((sx, sy)) = rc.start.take() {
                        let (ex, ey) = core.cursor.get();
                        rc.active = false;
                        drop(rc);
                        let rect = crate::engine::vision::Rect {
                            x: sx.min(ex),
                            y: sy.min(ey),
                            w: (sx - ex).abs().max(1),
                            h: (sy - ey).abs().max(1),
                        };
                        let _ = app.emit(names::REGION_CAPTURED, rect);
                    }
                    return;
                }
                RawInput::Key {
                    code,
                    action: KeyAction::Press,
                } if code == "Escape" => {
                    rc.active = false;
                    rc.start = None;
                    drop(rc);
                    let _ = app.emit(names::REGION_CAPTURE_CANCELLED, ());
                    return;
                }
                _ => return, // swallow other input during capture
            }
        }
    }

    // 1) Feed the recorder (cursor pos for button events).
    if core.recorder.is_active() {
        let cursor = core.cursor.get();
        let codes = core.hotkeys.codes();
        if let Some(ev) = core.recorder.feed(raw, cursor, &codes) {
            let _ = app.emit(
                names::RECORDING_EVENT_ADDED,
                RecordingEventAdded {
                    count: core.recorder.count(),
                    last_event: ev,
                },
            );
        }
    }

    // 2) Hotkeys — edge-triggered. `on_press` suppresses OS auto-repeat for the
    //    toggle actions (so a held F5/F6 doesn't flip play/record on→off→on);
    //    `on_release` clears the held state for the next real press.
    match raw {
        RawInput::Key {
            code,
            action: KeyAction::Press,
        } => {
            if let Some(action) = core.hotkeys.on_press(code) {
                handle_hotkey(core, app, action);
            }
        }
        RawInput::Key {
            code,
            action: KeyAction::Release,
        } => core.hotkeys.on_release(code),
        _ => {}
    }

    // 3) Corner failsafe — only on real user moves during playback.
    if let RawInput::Move { x, y } = raw {
        maybe_corner_failsafe(core, app, *x, *y);
    }
}

fn handle_hotkey(core: &AppCore, app: &AppHandle, action: HotkeyAction) {
    match action {
        HotkeyAction::Panic => {
            let enabled = core.settings.lock().unwrap().failsafe.panic_enabled;
            if enabled {
                core.player.panic();
                core.color_trigger.panic();
                core.autoclicker.panic();
            }
            let _ = app.emit(
                names::HOTKEY_TRIGGERED,
                HotkeyTriggered {
                    action: HotkeyAction::Panic,
                },
            );
        }
        // Record + Play/Stop are handled entirely in Rust so they work even when
        // the window is minimized (the webview is suspended then).
        HotkeyAction::Record => {
            core.toggle_record(app);
            let _ = app.emit(
                names::HOTKEY_TRIGGERED,
                HotkeyTriggered {
                    action: HotkeyAction::Record,
                },
            );
        }
        HotkeyAction::PlayStop => {
            if core.anything_running() {
                core.stop_all();
            } else {
                core.play_intent(app);
            }
            let _ = app.emit(
                names::HOTKEY_TRIGGERED,
                HotkeyTriggered {
                    action: HotkeyAction::PlayStop,
                },
            );
        }
        // Auto-click has its own hotkey: start the clicker with the last-pushed
        // options, or stop whatever's running. Works while minimized.
        HotkeyAction::AutoclickToggle => {
            if core.anything_running() {
                core.stop_all();
            } else if let Some(opts) = core.autoclick_opts.lock().unwrap().clone() {
                core.start_autoclick(app, opts);
            }
            let _ = app.emit(
                names::HOTKEY_TRIGGERED,
                HotkeyTriggered {
                    action: HotkeyAction::AutoclickToggle,
                },
            );
        }
        // Capture fills a Step field — needs the focused editor, so route to UI.
        HotkeyAction::Capture => {
            let _ = app.emit(
                names::HOTKEY_TRIGGERED,
                HotkeyTriggered {
                    action: HotkeyAction::Capture,
                },
            );
        }
    }
}

fn maybe_corner_failsafe(core: &AppCore, app: &AppHandle, x: i32, y: i32) {
    let playing = core.player.is_playing()
        || core.color_trigger.is_running()
        || core.autoclicker.is_running();
    if !playing {
        return;
    }
    let cfg = core.settings.lock().unwrap().failsafe;
    if !cfg.corner_failsafe_enabled {
        return;
    }
    // Ignore our own synthesized moves.
    let (sx, sy) = core.player.last_synth();
    let (tx, ty) = core.color_trigger.last_synth();
    let (ax2, ay2) = core.autoclicker.last_synth();
    // Overflow-safe (last_synth defaults to i32::MIN before anything synthesizes).
    let near_synth = |ax: i32, ay: i32| within(ax, ay, x, y, 2);
    if near_synth(sx, sy) || near_synth(tx, ty) || near_synth(ax2, ay2) {
        return;
    }
    let monitors = core.monitors.lock().unwrap().clone();
    if is_at_corner(x, y, &monitors, cfg.corner_threshold_px) {
        core.player.panic();
        core.color_trigger.panic();
        core.autoclicker.panic();
        let _ = app.emit(
            names::HOTKEY_TRIGGERED,
            HotkeyTriggered {
                action: HotkeyAction::Panic,
            },
        );
    }
}
