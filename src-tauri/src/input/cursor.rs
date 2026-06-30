//! Live cursor position, updated by the global listener (SPEC §4). rdev has no
//! direct "read cursor" call, so we track the last position the listener saw.
//! `get_cursor_position` / `capture_cursor` read this.

use std::sync::atomic::{AtomicBool, AtomicI32, Ordering};

#[derive(Default)]
pub struct CursorTracker {
    x: AtomicI32,
    y: AtomicI32,
    seen: AtomicBool,
}

impl CursorTracker {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn update(&self, x: i32, y: i32) {
        self.x.store(x, Ordering::Relaxed);
        self.y.store(y, Ordering::Relaxed);
        self.seen.store(true, Ordering::Relaxed);
    }

    pub fn get(&self) -> (i32, i32) {
        (
            self.x.load(Ordering::Relaxed),
            self.y.load(Ordering::Relaxed),
        )
    }

    /// Whether the listener has reported at least one position yet.
    pub fn has_seen(&self) -> bool {
        self.seen.load(Ordering::Relaxed)
    }
}
