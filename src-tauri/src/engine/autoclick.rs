//! Dedicated auto-clicker (OP Auto Clicker / Murgee parity). A tight click loop
//! at a fixed interval — the direct "click here every N ms, forever or N times"
//! tool, distinct from the macro timeline. Shares the cancel / panic / corner
//! failsafe model with the player (SPEC §F6).

use std::sync::atomic::{AtomicBool, AtomicI32, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use super::failsafe::CancelToken;
use crate::input::backend::InputBackend;
use crate::input::coords::clamp_to_monitors;
use crate::model::{KeyAction, Monitor, MouseButton};
use crate::util::Rng;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutoClickOpts {
    /// Delay between clicks in milliseconds.
    pub interval_ms: u64,
    pub button: MouseButton,
    /// 1 = single, 2 = double, 3 = triple.
    pub clicks_per_event: u8,
    /// 0 = repeat until stopped.
    pub repeat: u32,
    /// false = click wherever the cursor currently is (don't move it).
    pub use_fixed_pos: bool,
    pub x: i32,
    pub y: i32,
    /// Randomize each interval by ±pct (0.0 = off). Humanization, not anti-cheat.
    pub jitter_time_pct: f32,
    /// Random position offset radius in px (fixed-position only; 0 = off).
    pub jitter_pos_px: u32,
    /// Key-presser mode (Murgee parity): when set, press this key code instead
    /// of clicking the mouse (no cursor move). `None` = mouse click.
    #[serde(default)]
    pub key_code: Option<String>,
}

const SLEEP_CHUNK: Duration = Duration::from_millis(5);
const DOUBLE_CLICK_GAP: Duration = Duration::from_millis(10);

pub trait AutoClickSink: Send + Sync {
    fn clicked(&self, _total: u32) {}
    fn finished(&self, _total: u32, _panicked: bool) {}
}

pub struct AutoClicker {
    backend: Arc<dyn InputBackend>,
    token: Mutex<Option<CancelToken>>,
    running: AtomicBool,
    panicked: AtomicBool,
    last_synth_x: AtomicI32,
    last_synth_y: AtomicI32,
    clicks: AtomicU32,
}

impl AutoClicker {
    pub fn new(backend: Arc<dyn InputBackend>) -> Self {
        Self {
            backend,
            token: Mutex::new(None),
            running: AtomicBool::new(false),
            panicked: AtomicBool::new(false),
            last_synth_x: AtomicI32::new(i32::MIN),
            last_synth_y: AtomicI32::new(i32::MIN),
            clicks: AtomicU32::new(0),
        }
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }

    pub fn last_synth(&self) -> (i32, i32) {
        (
            self.last_synth_x.load(Ordering::Relaxed),
            self.last_synth_y.load(Ordering::Relaxed),
        )
    }

    pub fn stop(&self) {
        if let Some(t) = self.token.lock().unwrap().as_ref() {
            t.cancel();
        }
    }

    pub fn panic(&self) {
        self.panicked.store(true, Ordering::SeqCst);
        self.stop();
    }

    /// Start the click loop on a dedicated thread. Cancels any prior run first.
    pub fn start_with<S: AutoClickSink + 'static>(
        self: &Arc<Self>,
        opts: AutoClickOpts,
        monitors: Vec<Monitor>,
        sink: Arc<S>,
    ) {
        self.stop();
        let token = CancelToken::new();
        *self.token.lock().unwrap() = Some(token.clone());
        self.panicked.store(false, Ordering::SeqCst);
        self.clicks.store(0, Ordering::SeqCst);
        self.running.store(true, Ordering::SeqCst);

        let this = Arc::clone(self);
        thread::Builder::new()
            .name("autoclicker".into())
            .spawn(move || {
                this.run_with(opts, &monitors, token, sink.as_ref());
                let panicked = this.panicked.load(Ordering::SeqCst);
                this.running.store(false, Ordering::SeqCst);
                sink.finished(this.clicks.load(Ordering::SeqCst), panicked);
            })
            .expect("failed to spawn autoclicker thread");
    }

    fn run_with<S: AutoClickSink + ?Sized>(
        &self,
        opts: AutoClickOpts,
        monitors: &[Monitor],
        token: CancelToken,
        sink: &S,
    ) {
        let mut rng = Rng::from_clock();
        let per = opts.clicks_per_event.max(1);
        let mut done: u32 = 0;

        loop {
            if token.is_cancelled() {
                return;
            }
            if opts.repeat != 0 && done >= opts.repeat {
                return;
            }

            // Key-presser mode (no cursor move) vs mouse mode.
            if let Some(code) = &opts.key_code {
                for i in 0..per {
                    if token.is_cancelled() {
                        return;
                    }
                    let _ = self.backend.key(code, KeyAction::Press);
                    let _ = self.backend.key(code, KeyAction::Release);
                    if i + 1 < per {
                        thread::sleep(DOUBLE_CLICK_GAP);
                    }
                }
            } else {
                if opts.use_fixed_pos {
                    let (mut px, mut py) = (opts.x, opts.y);
                    if opts.jitter_pos_px > 0 {
                        let (dx, dy) = rng.point_in_disc(opts.jitter_pos_px as f64);
                        px += dx.round() as i32;
                        py += dy.round() as i32;
                    }
                    let (cx, cy) = clamp_to_monitors(px, py, monitors);
                    self.last_synth_x.store(cx, Ordering::Relaxed);
                    self.last_synth_y.store(cy, Ordering::Relaxed);
                    let _ = self.backend.move_to(cx, cy);
                }
                for i in 0..per {
                    if token.is_cancelled() {
                        return;
                    }
                    let _ = self.backend.button(opts.button, KeyAction::Press);
                    let _ = self.backend.button(opts.button, KeyAction::Release);
                    if i + 1 < per {
                        thread::sleep(DOUBLE_CLICK_GAP);
                    }
                }
            }
            done = done.saturating_add(1);
            sink.clicked(done);

            // Wait the (jittered) interval, checking cancel frequently.
            let mut wait = opts.interval_ms as f64;
            if opts.jitter_time_pct > 0.0 {
                let p = opts.jitter_time_pct as f64;
                wait *= (1.0 + rng.range_f64(-p, p)).max(0.0);
            }
            let target = Instant::now() + Duration::from_millis(wait.round() as u64);
            while Instant::now() < target {
                if token.is_cancelled() {
                    return;
                }
                thread::sleep(SLEEP_CHUNK.min(target.saturating_duration_since(Instant::now())));
            }
        }
    }
}

struct NoopSink;
impl AutoClickSink for NoopSink {}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex as StdMutex;

    #[derive(Default)]
    struct Mock {
        ops: StdMutex<Vec<String>>,
    }
    impl InputBackend for Mock {
        fn move_to(&self, x: i32, y: i32) -> crate::input::backend::Result<()> {
            self.ops.lock().unwrap().push(format!("move {x},{y}"));
            Ok(())
        }
        fn button(&self, b: MouseButton, a: KeyAction) -> crate::input::backend::Result<()> {
            self.ops.lock().unwrap().push(format!("btn {b:?} {a:?}"));
            Ok(())
        }
        fn key(&self, c: &str, a: KeyAction) -> crate::input::backend::Result<()> {
            self.ops.lock().unwrap().push(format!("key {c} {a:?}"));
            Ok(())
        }
        fn name(&self) -> &'static str {
            "mock"
        }
    }

    struct CountSink(StdMutex<u32>);
    impl AutoClickSink for CountSink {
        fn clicked(&self, total: u32) {
            *self.0.lock().unwrap() = total;
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

    fn opts() -> AutoClickOpts {
        AutoClickOpts {
            interval_ms: 0,
            button: MouseButton::Left,
            clicks_per_event: 1,
            repeat: 3,
            use_fixed_pos: true,
            x: 100,
            y: 200,
            jitter_time_pct: 0.0,
            jitter_pos_px: 0,
            key_code: None,
        }
    }

    #[test]
    fn fixed_position_repeat_n_clicks_n_times() {
        let backend = Arc::new(Mock::default());
        let ac = AutoClicker::new(backend.clone());
        let token = CancelToken::new();
        let sink = CountSink(StdMutex::new(0));
        ac.run_with(opts(), &mon(), token, &sink);
        assert_eq!(*sink.0.lock().unwrap(), 3);
        let ops = backend.ops.lock().unwrap().clone();
        assert_eq!(ops.iter().filter(|o| o.contains("Press")).count(), 3);
        assert_eq!(ops.iter().filter(|o| *o == "move 100,200").count(), 3);
    }

    #[test]
    fn double_click_emits_two_press_release_pairs() {
        let backend = Arc::new(Mock::default());
        let ac = AutoClicker::new(backend.clone());
        let mut o = opts();
        o.clicks_per_event = 2;
        o.repeat = 1;
        ac.run_with(o, &mon(), CancelToken::new(), &NoopSink);
        let ops = backend.ops.lock().unwrap().clone();
        assert_eq!(ops.iter().filter(|x| x.contains("Press")).count(), 2);
    }

    #[test]
    fn cancelled_before_start_does_nothing() {
        let backend = Arc::new(Mock::default());
        let ac = AutoClicker::new(backend.clone());
        let token = CancelToken::new();
        token.cancel();
        let mut o = opts();
        o.repeat = 0; // infinite — must still bail immediately
        ac.run_with(o, &mon(), token, &NoopSink);
        assert!(backend.ops.lock().unwrap().is_empty());
    }

    #[test]
    fn current_position_does_not_move() {
        let backend = Arc::new(Mock::default());
        let ac = AutoClicker::new(backend.clone());
        let mut o = opts();
        o.use_fixed_pos = false;
        o.repeat = 2;
        ac.run_with(o, &mon(), CancelToken::new(), &NoopSink);
        let ops = backend.ops.lock().unwrap().clone();
        assert!(ops.iter().all(|x| !x.starts_with("move")));
    }

    #[test]
    fn key_presser_mode_presses_key_not_mouse() {
        let backend = Arc::new(Mock::default());
        let ac = AutoClicker::new(backend.clone());
        let mut o = opts();
        o.key_code = Some("KeyE".into());
        o.repeat = 2;
        ac.run_with(o, &mon(), CancelToken::new(), &NoopSink);
        let ops = backend.ops.lock().unwrap().clone();
        // Mock records key presses via the key() trait method (no "btn"/"move").
        assert!(ops
            .iter()
            .all(|x| !x.starts_with("btn") && !x.starts_with("move")));
    }
}
