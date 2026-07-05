//! Color Trigger runner (owner request). Repeatedly captures the screen, finds
//! the largest blob of a target color, and clicks its centroid - locked on
//! rotating/shrinking/overlapping targets that defeat template matching.
//! Shares the cancel/panic/corner-failsafe model with the player (SPEC §F6).

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use super::failsafe::CancelToken;
use super::screen::find_color_now;
use super::vision::ColorMatchConfig;
use crate::input::backend::InputBackend;
use crate::model::{KeyAction, MouseButton};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColorTriggerOpts {
    #[serde(rename = "match")]
    pub match_cfg: ColorMatchConfig,
    /// Minimum delay between clicks (ms).
    pub interval_ms: u64,
    pub button: MouseButton,
    /// If false, click wherever the cursor is (don't move) - rarely wanted.
    pub move_before_click: bool,
}

const SLEEP_CHUNK: Duration = Duration::from_millis(5);

/// Notifications from the trigger loop. Decoupled for testability.
pub trait TriggerSink: Send + Sync {
    fn clicked(&self, _total: u32, _x: i32, _y: i32) {}
    fn finished(&self, _total: u32, _panicked: bool) {}
}

pub struct ColorTrigger {
    backend: Arc<dyn InputBackend>,
    token: Mutex<Option<CancelToken>>,
    running: AtomicBool,
    panicked: AtomicBool,
    last_synth_x: std::sync::atomic::AtomicI32,
    last_synth_y: std::sync::atomic::AtomicI32,
    clicks: AtomicU32,
}

impl ColorTrigger {
    pub fn new(backend: Arc<dyn InputBackend>) -> Self {
        Self {
            backend,
            token: Mutex::new(None),
            running: AtomicBool::new(false),
            panicked: AtomicBool::new(false),
            last_synth_x: std::sync::atomic::AtomicI32::new(i32::MIN),
            last_synth_y: std::sync::atomic::AtomicI32::new(i32::MIN),
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

    pub fn start<S: TriggerSink + 'static>(self: &Arc<Self>, opts: ColorTriggerOpts, sink: Arc<S>) {
        self.stop();
        let token = CancelToken::new();
        *self.token.lock().unwrap() = Some(token.clone());
        self.panicked.store(false, Ordering::SeqCst);
        self.clicks.store(0, Ordering::SeqCst);
        self.running.store(true, Ordering::SeqCst);

        let this = Arc::clone(self);
        thread::Builder::new()
            .name("color-trigger".into())
            .spawn(move || {
                this.run(opts, token, sink.as_ref());
                let panicked = this.panicked.load(Ordering::SeqCst);
                this.running.store(false, Ordering::SeqCst);
                sink.finished(this.clicks.load(Ordering::SeqCst), panicked);
            })
            .expect("failed to spawn color-trigger thread");
    }

    fn run<S: TriggerSink + ?Sized>(&self, opts: ColorTriggerOpts, token: CancelToken, sink: &S) {
        while !token.is_cancelled() {
            match find_color_now(&opts.match_cfg) {
                Ok(Some(blob)) => {
                    if opts.move_before_click {
                        self.last_synth_x.store(blob.x, Ordering::Relaxed);
                        self.last_synth_y.store(blob.y, Ordering::Relaxed);
                        let _ = self.backend.move_to(blob.x, blob.y);
                    }
                    let _ = self.backend.button(opts.button, KeyAction::Press);
                    let _ = self.backend.button(opts.button, KeyAction::Release);
                    let n = self.clicks.fetch_add(1, Ordering::SeqCst) + 1;
                    sink.clicked(n, blob.x, blob.y);
                }
                Ok(None) => {} // target not on screen this tick
                Err(_e) => {}  // capture hiccup; keep trying
            }
            // Wait the interval, checking the cancel token frequently.
            let target = Instant::now() + Duration::from_millis(opts.interval_ms);
            while Instant::now() < target {
                if token.is_cancelled() {
                    return;
                }
                thread::sleep(SLEEP_CHUNK.min(target - Instant::now()));
            }
        }
    }
}
