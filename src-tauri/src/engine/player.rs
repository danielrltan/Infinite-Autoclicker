//! Playback engine (SPEC §F3, §F3a). Consumes a timeline and drives the
//! `InputBackend`. Timing is anchored to a virtual clock so drags/clicks that
//! consume real time self-correct. Cancellation is checked between every event
//! and during every sleep chunk, so stop/panic/corner-slam aborts within ~50ms.

use std::sync::atomic::{AtomicBool, AtomicI32, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use super::failsafe::CancelToken;
use crate::input::backend::InputBackend;
use crate::input::coords::clamp_to_monitors;
use crate::ipc::events::{FinishReason, PlaybackFinished, PlaybackProgress};
use crate::model::{Event, EventKind, KeyAction, Macro, Monitor, PlaybackOpts};
use crate::util::Rng;

/// Where progress/finished updates go. Decoupled from Tauri so the engine is
/// unit-testable with a recording mock.
pub trait PlaybackSink: Send + Sync {
    fn progress(&self, _p: PlaybackProgress) {}
    fn finished(&self, _f: PlaybackFinished) {}
}

const SLEEP_CHUNK: Duration = Duration::from_millis(5);
const PROGRESS_THROTTLE: Duration = Duration::from_millis(40);
const DRAG_STEP_MS: u64 = 10;
/// Gap between screen captures while a color step waits for its target.
const COLOR_SCAN_INTERVAL: Duration = Duration::from_millis(80);

/// Manages the single active playback. Stored in `AppCore`.
pub struct Player {
    backend: Arc<dyn InputBackend>,
    token: Mutex<Option<CancelToken>>,
    playing: AtomicBool,
    reason: Mutex<FinishReason>,
    last_synth_x: AtomicI32,
    last_synth_y: AtomicI32,
}

impl Player {
    pub fn new(backend: Arc<dyn InputBackend>) -> Self {
        Self {
            backend,
            token: Mutex::new(None),
            playing: AtomicBool::new(false),
            reason: Mutex::new(FinishReason::Stopped),
            last_synth_x: AtomicI32::new(i32::MIN),
            last_synth_y: AtomicI32::new(i32::MIN),
        }
    }

    pub fn is_playing(&self) -> bool {
        self.playing.load(Ordering::SeqCst)
    }

    /// Last position the player synthesized — lets the corner-failsafe ignore
    /// the player's own moves and only react to real user moves.
    pub fn last_synth(&self) -> (i32, i32) {
        (
            self.last_synth_x.load(Ordering::Relaxed),
            self.last_synth_y.load(Ordering::Relaxed),
        )
    }

    fn set_last_synth(&self, x: i32, y: i32) {
        self.last_synth_x.store(x, Ordering::Relaxed);
        self.last_synth_y.store(y, Ordering::Relaxed);
    }

    pub fn stop(&self) {
        *self.reason.lock().unwrap() = FinishReason::Stopped;
        if let Some(t) = self.token.lock().unwrap().as_ref() {
            t.cancel();
        }
    }

    /// Abort immediately (panic key / corner failsafe).
    pub fn panic(&self) {
        *self.reason.lock().unwrap() = FinishReason::Panic;
        if let Some(t) = self.token.lock().unwrap().as_ref() {
            t.cancel();
        }
    }

    /// Start playback on a dedicated thread. Cancels any existing playback first.
    pub fn play<S: PlaybackSink + 'static>(
        self: &Arc<Self>,
        macro_: Macro,
        opts: PlaybackOpts,
        monitors: Vec<Monitor>,
        sink: Arc<S>,
    ) {
        // Cancel and let any prior run observe the flag.
        self.stop();

        let token = CancelToken::new();
        *self.token.lock().unwrap() = Some(token.clone());
        *self.reason.lock().unwrap() = FinishReason::Stopped;
        self.playing.store(true, Ordering::SeqCst);

        let this = Arc::clone(self);
        let backend = Arc::clone(&self.backend);
        thread::Builder::new()
            .name("playback".into())
            .spawn(move || {
                let on_move = |x: i32, y: i32| this.set_last_synth(x, y);
                let (loops, normal) = run_playback(
                    &macro_,
                    &opts,
                    &monitors,
                    backend.as_ref(),
                    &token,
                    sink.as_ref(),
                    &on_move,
                );
                this.playing.store(false, Ordering::SeqCst);
                let reason = if normal {
                    FinishReason::Done
                } else {
                    *this.reason.lock().unwrap()
                };
                sink.finished(PlaybackFinished {
                    loops_completed: loops,
                    reason,
                });
            })
            .expect("failed to spawn playback thread");
    }
}

/// Sleep until `target`, checking the cancel token every chunk. Returns false if
/// cancelled. If already past `target`, returns true immediately.
fn sleep_until(target: Instant, cancel: &CancelToken) -> bool {
    loop {
        if cancel.is_cancelled() {
            return false;
        }
        let now = Instant::now();
        if now >= target {
            return true;
        }
        let remaining = target - now;
        thread::sleep(remaining.min(SLEEP_CHUNK));
    }
}

fn timing_factor(rng: &mut Rng, pct: f32) -> f64 {
    if pct <= 0.0 {
        1.0
    } else {
        let p = pct as f64;
        (1.0 + rng.range_f64(-p, p)).max(0.0)
    }
}

/// The testable playback core. Returns (loops_completed, completed_normally).
#[allow(clippy::too_many_arguments)]
pub fn run_playback<S: PlaybackSink + ?Sized>(
    macro_: &Macro,
    opts: &PlaybackOpts,
    monitors: &[Monitor],
    backend: &dyn InputBackend,
    cancel: &CancelToken,
    sink: &S,
    on_move: &dyn Fn(i32, i32),
) -> (u32, bool) {
    let events = &macro_.events;
    let total_events = events.len();
    let total_loops = if opts.repeat == 0 {
        None
    } else {
        Some(opts.repeat)
    };
    let speed = (opts.speed as f64).max(0.01);
    let jitter = &opts.jitter;
    let mut rng = Rng::from_clock();

    let mut loops_completed: u32 = 0;
    let mut last_progress = Instant::now()
        .checked_sub(PROGRESS_THROTTLE)
        .unwrap_or_else(Instant::now);

    let mut loop_index: u32 = 0;
    loop {
        if let Some(r) = total_loops {
            if loop_index >= r {
                break;
            }
        }
        if cancel.is_cancelled() {
            return (loops_completed, false);
        }

        // Per-loop position offset so the spot drifts slightly each repeat but
        // a click's down/up stay paired (SPEC §F3a).
        let pos_off = if jitter.position_radius_px > 0 {
            rng.point_in_disc(jitter.position_radius_px as f64)
        } else {
            (0.0, 0.0)
        };

        let loop_start = Instant::now();
        let mut scheduled = loop_start;
        let mut prev_t: u64 = 0;

        for (i, ev) in events.iter().enumerate() {
            if cancel.is_cancelled() {
                return (loops_completed, false);
            }

            let base_gap = (ev.t.saturating_sub(prev_t)) as f64 / speed;
            let gap = base_gap * timing_factor(&mut rng, jitter.timing_pct);
            scheduled += Duration::from_millis(gap.round() as u64);
            if !sleep_until(scheduled, cancel) {
                return (loops_completed, false);
            }
            prev_t = ev.t;

            // Throttled progress.
            if last_progress.elapsed() >= PROGRESS_THROTTLE || i + 1 == total_events {
                sink.progress(PlaybackProgress {
                    loop_index,
                    event_index: i,
                    total_events,
                    total_loops,
                });
                last_progress = Instant::now();
            }

            execute_event(
                ev, monitors, backend, &mut rng, jitter, pos_off, cancel, on_move,
            );
        }

        loops_completed = loops_completed.saturating_add(1);
        loop_index = loop_index.saturating_add(1);
    }

    (loops_completed, true)
}

#[allow(clippy::too_many_arguments)]
fn execute_event(
    ev: &Event,
    monitors: &[Monitor],
    backend: &dyn InputBackend,
    rng: &mut Rng,
    jitter: &crate::model::JitterConfig,
    pos_off: (f64, f64),
    cancel: &CancelToken,
    on_move: &dyn Fn(i32, i32),
) {
    let move_to = |x: i32, y: i32| {
        let (cx, cy) = clamp_to_monitors(x, y, monitors);
        on_move(cx, cy);
        let _ = backend.move_to(cx, cy);
    };
    let pos = |x: i32, y: i32| -> (i32, i32) {
        let jx = x + pos_off.0.round() as i32;
        let jy = y + pos_off.1.round() as i32;
        clamp_to_monitors(jx, jy, monitors)
    };
    let path = |rng: &mut Rng, x: i32, y: i32| -> (i32, i32) {
        if jitter.path_deviation_px > 0 {
            let (dx, dy) = rng.point_in_disc(jitter.path_deviation_px as f64);
            clamp_to_monitors(x + dx.round() as i32, y + dy.round() as i32, monitors)
        } else {
            clamp_to_monitors(x, y, monitors)
        }
    };

    match &ev.kind {
        EventKind::Move { x, y } => {
            let (px, py) = path(rng, *x, *y);
            move_to(px, py);
        }
        EventKind::Down { button, x, y } => {
            let (px, py) = pos(*x, *y);
            move_to(px, py);
            let _ = backend.button(*button, KeyAction::Press);
        }
        EventKind::Up { button, x, y } => {
            let (px, py) = pos(*x, *y);
            move_to(px, py);
            let _ = backend.button(*button, KeyAction::Release);
        }
        EventKind::Click {
            button,
            x,
            y,
            count,
        } => {
            let (px, py) = pos(*x, *y);
            move_to(px, py);
            for _ in 0..(*count).max(1) {
                let _ = backend.button(*button, KeyAction::Press);
                let _ = backend.button(*button, KeyAction::Release);
            }
        }
        EventKind::Drag {
            button,
            from,
            to,
            duration_ms,
        } => {
            let (fx, fy) = pos(from.0, from.1);
            let (tx, ty) = pos(to.0, to.1);
            move_to(fx, fy);
            let _ = backend.button(*button, KeyAction::Press);

            let steps = (duration_ms / DRAG_STEP_MS).max(1);
            let mut next = Instant::now();
            for s in 1..=steps {
                if cancel.is_cancelled() {
                    break;
                }
                let t = s as f64 / steps as f64;
                let ix = fx as f64 + (tx - fx) as f64 * t;
                let iy = fy as f64 + (ty - fy) as f64 * t;
                let (jx, jy) = path(rng, ix.round() as i32, iy.round() as i32);
                move_to(jx, jy);
                next += Duration::from_millis(DRAG_STEP_MS);
                if !sleep_until(next, cancel) {
                    break;
                }
            }
            move_to(tx, ty);
            let _ = backend.button(*button, KeyAction::Release);
        }
        EventKind::Scroll { x, y, dx, dy } => {
            let (px, py) = pos(*x, *y);
            move_to(px, py);
            let _ = backend.scroll(*dx, *dy);
        }
        EventKind::Key { code, action } => {
            let _ = backend.key(code, *action);
        }
        // Timing is driven by event `t`; Wait is a no-op marker (its pause is
        // encoded in the following event's timestamp).
        EventKind::Wait { .. } => {}
        EventKind::FindColor {
            match_cfg,
            button,
            count,
            move_before,
            timeout_ms,
        } => {
            // Resolve the click position from the live screen. Scan until found,
            // the timeout elapses, or we're cancelled — checking cancel every
            // capture so stop/panic/corner-slam still abort within ~one interval.
            let deadline = Instant::now() + Duration::from_millis(*timeout_ms as u64);
            loop {
                if cancel.is_cancelled() {
                    break;
                }
                if let Ok(Some(blob)) = super::screen::find_color_now(match_cfg) {
                    if *move_before {
                        move_to(blob.x, blob.y);
                    }
                    for _ in 0..(*count).max(1) {
                        let _ = backend.button(*button, KeyAction::Press);
                        let _ = backend.button(*button, KeyAction::Release);
                    }
                    break;
                }
                if *timeout_ms == 0 || Instant::now() >= deadline {
                    break; // not found: skip this step
                }
                let next = (Instant::now() + COLOR_SCAN_INTERVAL).min(deadline);
                if !sleep_until(next, cancel) {
                    break;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{MacroSettings, MouseButton, Source};
    use std::sync::Mutex as StdMutex;

    #[derive(Default)]
    struct MockBackend {
        ops: StdMutex<Vec<String>>,
    }
    impl InputBackend for MockBackend {
        fn move_to(&self, x: i32, y: i32) -> crate::input::backend::Result<()> {
            self.ops.lock().unwrap().push(format!("move {x},{y}"));
            Ok(())
        }
        fn button(&self, b: MouseButton, a: KeyAction) -> crate::input::backend::Result<()> {
            self.ops.lock().unwrap().push(format!("button {b:?} {a:?}"));
            Ok(())
        }
        fn key(&self, code: &str, a: KeyAction) -> crate::input::backend::Result<()> {
            self.ops.lock().unwrap().push(format!("key {code} {a:?}"));
            Ok(())
        }
        fn name(&self) -> &'static str {
            "mock"
        }
    }

    #[derive(Default)]
    struct CountingSink {
        progress: StdMutex<u32>,
    }
    impl PlaybackSink for CountingSink {
        fn progress(&self, _p: PlaybackProgress) {
            *self.progress.lock().unwrap() += 1;
        }
    }

    fn mon() -> Vec<Monitor> {
        vec![Monitor {
            id: 0,
            x: 0,
            y: 0,
            w: 1920,
            h: 1080,
            scale: 1.0,
        }]
    }

    fn click_macro() -> Macro {
        Macro {
            version: 1,
            name: "t".into(),
            created: "now".into(),
            source: Source::Built,
            settings: MacroSettings::default(),
            monitors: mon(),
            events: vec![Event {
                t: 0,
                kind: EventKind::Click {
                    button: MouseButton::Left,
                    x: 100,
                    y: 100,
                    count: 1,
                },
            }],
        }
    }

    #[test]
    fn click_expands_to_move_press_release() {
        let backend = MockBackend::default();
        let sink = CountingSink::default();
        let cancel = CancelToken::new();
        let opts = PlaybackOpts {
            repeat: 1,
            speed: 1.0,
            jitter: Default::default(),
        };
        let (loops, normal) = run_playback(
            &click_macro(),
            &opts,
            &mon(),
            &backend,
            &cancel,
            &sink,
            &|_, _| {},
        );
        assert_eq!(loops, 1);
        assert!(normal);
        let ops = backend.ops.lock().unwrap().clone();
        assert_eq!(ops[0], "move 100,100");
        assert!(ops.iter().any(|o| o.contains("Press")));
        assert!(ops.iter().any(|o| o.contains("Release")));
    }

    #[test]
    fn cancel_before_start_emits_nothing() {
        let backend = MockBackend::default();
        let sink = CountingSink::default();
        let cancel = CancelToken::new();
        cancel.cancel();
        let opts = PlaybackOpts {
            repeat: 0, // infinite
            speed: 1.0,
            jitter: Default::default(),
        };
        let (loops, normal) = run_playback(
            &click_macro(),
            &opts,
            &mon(),
            &backend,
            &cancel,
            &sink,
            &|_, _| {},
        );
        assert_eq!(loops, 0);
        assert!(!normal);
        assert!(backend.ops.lock().unwrap().is_empty());
    }

    #[test]
    fn repeat_runs_n_loops() {
        let backend = MockBackend::default();
        let sink = CountingSink::default();
        let cancel = CancelToken::new();
        let opts = PlaybackOpts {
            repeat: 3,
            speed: 4.0,
            jitter: Default::default(),
        };
        let (loops, normal) = run_playback(
            &click_macro(),
            &opts,
            &mon(),
            &backend,
            &cancel,
            &sink,
            &|_, _| {},
        );
        assert_eq!(loops, 3);
        assert!(normal);
    }

    #[test]
    fn position_jitter_keeps_clicks_on_valid_pixels() {
        let backend = MockBackend::default();
        let sink = CountingSink::default();
        let cancel = CancelToken::new();
        let opts = PlaybackOpts {
            repeat: 5,
            speed: 4.0,
            jitter: crate::model::JitterConfig {
                position_radius_px: 30,
                timing_pct: 0.2,
                path_deviation_px: 0,
            },
        };
        let m = click_macro();
        run_playback(&m, &opts, &mon(), &backend, &cancel, &sink, &|_, _| {});
        // Every move op must land on a valid pixel of the (single) monitor.
        for op in backend.ops.lock().unwrap().iter() {
            if let Some(rest) = op.strip_prefix("move ") {
                let (xs, ys) = rest.split_once(',').unwrap();
                let x: i32 = xs.parse().unwrap();
                let y: i32 = ys.parse().unwrap();
                assert!(
                    crate::input::coords::point_on_any_monitor(x, y, &mon()),
                    "jittered point {x},{y} off-screen"
                );
            }
        }
    }
}
