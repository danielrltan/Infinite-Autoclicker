//! Cancellation + corner failsafe (SPEC §F6 — safety-critical).
//!
//! A tool that hijacks the mouse can lock the user out of their cursor. The
//! player checks `CancelToken` between every event (and during every sleep
//! chunk) so panic / stop / corner-slam aborts within ~50ms.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use crate::model::Monitor;

#[derive(Clone, Default)]
pub struct CancelToken(Arc<AtomicBool>);

impl CancelToken {
    pub fn new() -> Self {
        Self(Arc::new(AtomicBool::new(false)))
    }

    pub fn cancel(&self) {
        self.0.store(true, Ordering::SeqCst);
    }

    pub fn is_cancelled(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }

    pub fn reset(&self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

/// True if (ax,ay) and (bx,by) are within `threshold` px on both axes.
/// Overflow-safe (i64): the synthesized-position sentinel is `i32::MIN`, and
/// `x - i32::MIN` would overflow.
pub fn within(ax: i32, ay: i32, bx: i32, by: i32, threshold: i64) -> bool {
    (ax as i64 - bx as i64).abs() <= threshold && (ay as i64 - by as i64).abs() <= threshold
}

/// True if (x, y) is within `threshold` px of any monitor corner. Used to detect
/// a real user slamming the cursor into a corner during playback.
pub fn is_at_corner(x: i32, y: i32, monitors: &[Monitor], threshold: u32) -> bool {
    let t = threshold as i64;
    let near = |a: i32, b: i32, c: i32, d: i32| -> bool {
        let dx = (a - c) as i64;
        let dy = (b - d) as i64;
        dx * dx + dy * dy <= t * t
    };
    monitors.iter().any(|m| {
        let corners = [
            (m.x, m.y),
            (m.x + m.w - 1, m.y),
            (m.x, m.y + m.h - 1),
            (m.x + m.w - 1, m.y + m.h - 1),
        ];
        corners.iter().any(|&(cx, cy)| near(x, y, cx, cy))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

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

    #[test]
    fn cancel_token_flips() {
        let t = CancelToken::new();
        assert!(!t.is_cancelled());
        t.cancel();
        assert!(t.is_cancelled());
        t.reset();
        assert!(!t.is_cancelled());
    }

    #[test]
    fn top_left_corner_triggers() {
        assert!(is_at_corner(2, 2, &mon(), 5));
    }

    #[test]
    fn bottom_right_corner_triggers() {
        assert!(is_at_corner(1919, 1079, &mon(), 5));
    }

    #[test]
    fn center_does_not_trigger() {
        assert!(!is_at_corner(960, 540, &mon(), 5));
    }

    #[test]
    fn within_is_overflow_safe_with_min_sentinel() {
        // The synthesized-position sentinel is i32::MIN; comparing a real cursor
        // position against it must not overflow (this once killed the consumer
        // thread and trapped the user under a running clicker).
        assert!(!within(i32::MIN, i32::MIN, 500, 500, 2));
        assert!(!within(500, 500, i32::MIN, i32::MIN, 2));
        assert!(within(500, 500, 501, 499, 2));
        assert!(!within(500, 500, 510, 500, 2));
    }
}
