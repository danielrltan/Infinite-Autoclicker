//! Local screen capture for the Color Trigger (SPEC §F9: capture is local, never
//! transmitted). Wraps `xcap` and adapts each monitor into a plain RGBA frame
//! that `vision.rs` can scan.

use super::vision::{find_largest_blob, Blob, ColorMatchConfig, Frame, Rgb};
use xcap::Monitor;

/// An owned RGBA frame. `origin_*` are in the input-event space (points on
/// macOS); `width`/`height`/`data` are physical capture pixels. `scale` is the
/// physical-pixels-per-event-unit ratio (2.0 on a Retina display, 1.0 otherwise).
pub struct CapturedFrame {
    pub origin_x: i32,
    pub origin_y: i32,
    pub width: u32,
    pub height: u32,
    pub scale: f64,
    pub data: Vec<u8>,
}

impl CapturedFrame {
    fn as_frame(&self) -> Frame<'_> {
        Frame {
            origin_x: self.origin_x,
            origin_y: self.origin_y,
            width: self.width,
            height: self.height,
            scale: self.scale,
            rgba: &self.data,
        }
    }
}

/// Capture every monitor.
pub fn capture_all() -> Result<Vec<CapturedFrame>, String> {
    let monitors = Monitor::all().map_err(|e| format!("monitor enumeration failed: {e}"))?;
    let mut frames = Vec::with_capacity(monitors.len());
    for m in &monitors {
        let origin_x = m.x().map_err(|e| e.to_string())?;
        let origin_y = m.y().map_err(|e| e.to_string())?;
        // xcap reports monitor width in the event space (logical points on
        // macOS) but returns a *physical*-pixel capture buffer, so on Retina the
        // buffer is `scale`x wider. Derive the scale from the two rather than
        // assuming it. On Windows the event space is already physical pixels, so
        // keep 1.0 and index the buffer directly (byte-identical to before).
        let reported_w = m.width().map_err(|e| e.to_string())?;
        let img = m
            .capture_image()
            .map_err(|e| format!("capture failed: {e}"))?;
        let width = img.width();
        let height = img.height();
        let scale = if cfg!(target_os = "macos") && reported_w > 0 {
            width as f64 / reported_w as f64
        } else {
            1.0
        };
        frames.push(CapturedFrame {
            origin_x,
            origin_y,
            width,
            height,
            scale,
            data: img.into_raw(),
        });
    }
    Ok(frames)
}

/// Read the color of a single screen pixel (eyedropper for color picking).
pub fn pixel_at(x: i32, y: i32) -> Result<Option<Rgb>, String> {
    for cf in capture_all()? {
        // (x, y) arrive in event-space points; scale up to index the physical
        // capture buffer (identity on non-Retina / non-macOS).
        let lx = ((x - cf.origin_x) as f64 * cf.scale).round() as i32;
        let ly = ((y - cf.origin_y) as f64 * cf.scale).round() as i32;
        if lx >= 0 && ly >= 0 && (lx as u32) < cf.width && (ly as u32) < cf.height {
            let idx = ((ly as u32 * cf.width + lx as u32) as usize) * 4;
            if idx + 2 < cf.data.len() {
                return Ok(Some(Rgb {
                    r: cf.data[idx],
                    g: cf.data[idx + 1],
                    b: cf.data[idx + 2],
                }));
            }
        }
    }
    Ok(None)
}

/// Capture all monitors and return the single largest matching blob across them.
pub fn find_color_now(cfg: &ColorMatchConfig) -> Result<Option<Blob>, String> {
    let frames = capture_all()?;
    let mut best: Option<Blob> = None;
    for cf in &frames {
        if let Some(b) = find_largest_blob(&cf.as_frame(), cfg) {
            if best.map(|bb| b.area > bb.area).unwrap_or(true) {
                best = Some(b);
            }
        }
    }
    Ok(best)
}
