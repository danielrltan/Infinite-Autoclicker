//! `AppCore` holds every manager and wires the global input listener's single
//! consumer (hotkeys + recorder feed + corner failsafe). See SPEC §4.

use std::sync::mpsc::Receiver;
use std::sync::{Arc, Mutex};
use std::thread;

use tauri::{AppHandle, Emitter, Manager};
use tokio::runtime::Runtime;

use crate::engine::autoclick::{AutoClickOpts, AutoClickSink, AutoClicker};
use crate::engine::color_trigger::{ColorTrigger, ColorTriggerOpts, TriggerSink};
use crate::engine::failsafe::is_at_corner;
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
use crate::model::{KeyAction, Macro, Monitor, PlaybackOpts, Settings};

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
            rt,
        }
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
            let pos = m.position();
            let size = m.size();
            Monitor {
                id: i as u32,
                x: pos.x,
                y: pos.y,
                w: size.width as i32,
                h: size.height as i32,
                scale: m.scale_factor(),
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
            for raw in rx.iter() {
                // 1) Feed the recorder (cursor pos for button events).
                if core.recorder.is_active() {
                    let cursor = core.cursor.get();
                    let codes = core.hotkeys.codes();
                    if let Some(ev) = core.recorder.feed(&raw, cursor, &codes) {
                        let _ = app.emit(
                            names::RECORDING_EVENT_ADDED,
                            RecordingEventAdded {
                                count: core.recorder.count(),
                                last_event: ev,
                            },
                        );
                    }
                }

                // 2) Hotkeys — only on key press.
                if let RawInput::Key {
                    code,
                    action: KeyAction::Press,
                } = &raw
                {
                    if let Some(action) = core.hotkeys.match_action(code) {
                        handle_hotkey(&core, &app, action);
                    }
                }

                // 3) Corner failsafe — only on real user moves during playback.
                if let RawInput::Move { x, y } = raw {
                    maybe_corner_failsafe(&core, &app, x, y);
                }
            }
        })
        .expect("failed to spawn input-consumer thread");
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
        // Record / Play-Stop / Capture: forward to the UI (works unfocused; the
        // UI holds the current macro + options).
        other => {
            // Instant Rust-side stop if play/stop is pressed while running.
            if matches!(other, HotkeyAction::PlayStop)
                && (core.player.is_playing()
                    || core.color_trigger.is_running()
                    || core.autoclicker.is_running())
            {
                core.stop_all();
            }
            let _ = app.emit(names::HOTKEY_TRIGGERED, HotkeyTriggered { action: other });
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
    let near_synth = |ax: i32, ay: i32| (x - ax).abs() <= 2 && (y - ay).abs() <= 2;
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
