//! Local screen capture for the Color Trigger (SPEC §F9: capture is local, never
//! transmitted). Wraps `xcap` and adapts each monitor into a plain RGBA frame
//! that `vision.rs` can scan.

use super::vision::{find_largest_blob, Blob, ColorMatchConfig, Frame, Rgb};
use xcap::Monitor;

/// An owned RGBA frame placed in global screen coords.
pub struct CapturedFrame {
    pub origin_x: i32,
    pub origin_y: i32,
    pub width: u32,
    pub height: u32,
    pub data: Vec<u8>,
}

impl CapturedFrame {
    fn as_frame(&self) -> Frame<'_> {
        Frame {
            origin_x: self.origin_x,
            origin_y: self.origin_y,
            width: self.width,
            height: self.height,
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
        let img = m
            .capture_image()
            .map_err(|e| format!("capture failed: {e}"))?;
        let width = img.width();
        let height = img.height();
        frames.push(CapturedFrame {
            origin_x,
            origin_y,
            width,
            height,
            data: img.into_raw(),
        });
    }
    Ok(frames)
}

/// Read the color of a single screen pixel (eyedropper for color picking).
pub fn pixel_at(x: i32, y: i32) -> Result<Option<Rgb>, String> {
    for cf in capture_all()? {
        let lx = x - cf.origin_x;
        let ly = y - cf.origin_y;
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
