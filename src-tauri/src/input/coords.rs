//! Coordinate / DPI / multi-monitor math (SPEC §7 — correctness-critical).
//!
//! All stored coordinates are global virtual-desktop **physical** pixels, origin
//! at the virtual desktop's top-left (which may be negative on multi-monitor
//! layouts). On Windows we declare per-monitor DPI awareness v2 (via Tauri's
//! embedded manifest) so the OS reports true physical pixels and does not
//! virtualize coordinates. These helpers never assume a single 1.0 scale factor
//! and never assume (0,0) is the primary monitor's top-left.

use crate::model::Monitor;

/// Inclusive-exclusive rectangle of the whole virtual desktop in physical px.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct VirtualBounds {
    pub min_x: i32,
    pub min_y: i32,
    pub max_x: i32, // exclusive
    pub max_y: i32, // exclusive
}

/// Compute the bounding rectangle covering every monitor.
pub fn virtual_bounds(monitors: &[Monitor]) -> Option<VirtualBounds> {
    if monitors.is_empty() {
        return None;
    }
    let mut b = VirtualBounds {
        min_x: i32::MAX,
        min_y: i32::MAX,
        max_x: i32::MIN,
        max_y: i32::MIN,
    };
    for m in monitors {
        b.min_x = b.min_x.min(m.x);
        b.min_y = b.min_y.min(m.y);
        b.max_x = b.max_x.max(m.x + m.w);
        b.max_y = b.max_y.max(m.y + m.h);
    }
    Some(b)
}

/// Is the point inside this monitor's pixel area?
pub fn point_in_monitor(x: i32, y: i32, m: &Monitor) -> bool {
    x >= m.x && x < m.x + m.w && y >= m.y && y < m.y + m.h
}

/// Is the point on any connected monitor?
pub fn point_on_any_monitor(x: i32, y: i32, monitors: &[Monitor]) -> bool {
    monitors.iter().any(|m| point_in_monitor(x, y, m))
}

/// Squared distance from a point to a monitor's rectangle (0 if inside).
fn dist_sq_to_monitor(x: i32, y: i32, m: &Monitor) -> i64 {
    let cx = x.clamp(m.x, m.x + m.w - 1);
    let cy = y.clamp(m.y, m.y + m.h - 1);
    let dx = (x - cx) as i64;
    let dy = (y - cy) as i64;
    dx * dx + dy * dy
}

/// Clamp a point so it lands on a valid pixel of some monitor. Points already
/// on a monitor are returned unchanged; otherwise the point is clamped into the
/// rectangle of the nearest monitor. Used after position jitter (SPEC §F3a).
pub fn clamp_to_monitors(x: i32, y: i32, monitors: &[Monitor]) -> (i32, i32) {
    if monitors.is_empty() || point_on_any_monitor(x, y, monitors) {
        return (x, y);
    }
    let nearest = monitors
        .iter()
        .min_by_key(|m| dist_sq_to_monitor(x, y, m))
        .expect("non-empty checked above");
    (
        x.clamp(nearest.x, nearest.x + nearest.w - 1),
        y.clamp(nearest.y, nearest.y + nearest.h - 1),
    )
}

/// Convert a logical (scaled) coordinate within a monitor to a physical pixel.
pub fn logical_to_physical(logical: f64, scale: f64) -> i32 {
    (logical * scale).round() as i32
}

/// Convert a physical pixel to a logical (scaled) coordinate.
pub fn physical_to_logical(physical: i32, scale: f64) -> f64 {
    if scale == 0.0 {
        physical as f64
    } else {
        physical as f64 / scale
    }
}

/// Compare the display layout a macro was recorded on against the current one.
/// Returns a non-blocking warning string if they differ materially (SPEC §7.3).
pub fn layout_mismatch(recorded: &[Monitor], current: &[Monitor]) -> Option<String> {
    if recorded.is_empty() {
        return None; // nothing to compare against (e.g. older/built macros)
    }
    if recorded.len() != current.len() {
        return Some(format!(
            "This macro was recorded with {} display(s) but {} are connected now; coordinates may be off.",
            recorded.len(),
            current.len()
        ));
    }
    // Match each recorded monitor to one with identical bounds + scale.
    for rm in recorded {
        let matched = current.iter().any(|cm| {
            cm.x == rm.x
                && cm.y == rm.y
                && cm.w == rm.w
                && cm.h == rm.h
                && (cm.scale - rm.scale).abs() < 1e-6
        });
        if !matched {
            return Some(
                "This macro was recorded on a different display layout; coordinates may be off."
                    .to_string(),
            );
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mon(id: u32, x: i32, y: i32, w: i32, h: i32, scale: f64) -> Monitor {
        Monitor {
            id,
            x,
            y,
            w,
            h,
            scale,
        }
    }

    fn dual_layout() -> Vec<Monitor> {
        // Primary 2560x1440 @1.0 at origin, secondary 1920x1080 @1.5 to the right.
        vec![
            mon(0, 0, 0, 2560, 1440, 1.0),
            mon(1, 2560, 0, 1920, 1080, 1.5),
        ]
    }

    #[test]
    fn virtual_bounds_span_both_monitors() {
        let b = virtual_bounds(&dual_layout()).unwrap();
        assert_eq!(b.min_x, 0);
        assert_eq!(b.min_y, 0);
        assert_eq!(b.max_x, 4480);
        assert_eq!(b.max_y, 1440);
    }

    #[test]
    fn negative_origin_layout() {
        // Secondary to the LEFT of primary => negative origin.
        let mons = vec![
            mon(0, 0, 0, 1920, 1080, 1.0),
            mon(1, -1920, 0, 1920, 1080, 1.0),
        ];
        let b = virtual_bounds(&mons).unwrap();
        assert_eq!(b.min_x, -1920);
        assert_eq!(b.max_x, 1920);
    }

    #[test]
    fn point_on_secondary_scaled_monitor_is_valid() {
        let mons = dual_layout();
        // A point on the secondary 150% monitor (SPEC §7 acceptance).
        assert!(point_on_any_monitor(3000, 500, &mons));
        assert!(point_in_monitor(3000, 500, &mons[1]));
        assert!(!point_in_monitor(3000, 500, &mons[0]));
    }

    #[test]
    fn clamp_returns_inside_point_unchanged() {
        let mons = dual_layout();
        assert_eq!(clamp_to_monitors(3000, 500, &mons), (3000, 500));
    }

    #[test]
    fn clamp_pulls_offscreen_point_onto_nearest_monitor() {
        let mons = dual_layout();
        // Far right of the secondary monitor => clamp to its right edge pixel.
        let (x, y) = clamp_to_monitors(9999, 500, &mons);
        assert_eq!(x, 2560 + 1920 - 1);
        assert_eq!(y, 500);
        assert!(point_on_any_monitor(x, y, &mons));
    }

    #[test]
    fn dpi_conversions_roundtrip_on_150_percent() {
        // 1000 logical px at 150% scale = 1500 physical px.
        assert_eq!(logical_to_physical(1000.0, 1.5), 1500);
        assert!((physical_to_logical(1500, 1.5) - 1000.0).abs() < 1e-9);
    }

    #[test]
    fn layout_mismatch_detects_unplugged_monitor() {
        let recorded = dual_layout();
        let current = vec![mon(0, 0, 0, 2560, 1440, 1.0)];
        assert!(layout_mismatch(&recorded, &current).is_some());
    }

    #[test]
    fn layout_mismatch_detects_resolution_change() {
        let recorded = dual_layout();
        let mut current = dual_layout();
        current[0].w = 1920; // resolution changed
        assert!(layout_mismatch(&recorded, &current).is_some());
    }

    #[test]
    fn identical_layout_has_no_mismatch() {
        assert!(layout_mismatch(&dual_layout(), &dual_layout()).is_none());
    }
}
