//! Color-blob detection for the Color Trigger (owner request; SPEC §16 stretch
//! reframed). Template matching fails on targets that rotate/scale/overlap, so
//! we detect by **color**: find pixels near a target color, group them into
//! connected blobs, and return the largest blob's centroid. Color is rotation-
//! and scale-invariant, so a spinning/shrinking popup is tracked by its center.
//!
//! This module is pure (operates on an RGBA buffer) so it is fully unit-testable
//! without any screen-capture dependency. Capture lives in `engine/screen.rs`.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Rgb {
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

/// A screen-coordinate rectangle (physical px).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct ColorMatchConfig {
    pub target: Rgb,
    /// Euclidean RGB distance threshold (0–441). ~30–80 works for vivid colors.
    pub tolerance: u32,
    /// Search region in screen coords; `None` scans the whole captured frame.
    pub region: Option<Rect>,
    /// Ignore blobs smaller than this many matched pixels (noise filter).
    pub min_blob_px: u32,
}

/// A captured RGBA frame. `origin_*` place its top-left in global screen coords.
pub struct Frame<'a> {
    pub origin_x: i32,
    pub origin_y: i32,
    pub width: u32,
    pub height: u32,
    pub rgba: &'a [u8],
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Blob {
    /// Centroid in global screen coords.
    pub x: i32,
    pub y: i32,
    pub area: u32,
}

fn color_dist_sq(a: Rgb, b: Rgb) -> u32 {
    let dr = a.r as i32 - b.r as i32;
    let dg = a.g as i32 - b.g as i32;
    let db = a.b as i32 - b.b as i32;
    (dr * dr + dg * dg + db * db) as u32
}

/// Find the largest connected blob of pixels matching the target color. Returns
/// its centroid in global screen coords, or `None` if nothing passes the filter.
pub fn find_largest_blob(frame: &Frame, cfg: &ColorMatchConfig) -> Option<Blob> {
    let fw = frame.width as i32;
    let fh = frame.height as i32;
    if fw <= 0 || fh <= 0 {
        return None;
    }

    // Scan window in *local* frame coordinates, clamped to the region if given.
    let (mut sx0, mut sy0, mut sx1, mut sy1) = (0, 0, fw, fh);
    if let Some(r) = cfg.region {
        sx0 = (r.x - frame.origin_x).max(0);
        sy0 = (r.y - frame.origin_y).max(0);
        sx1 = (r.x - frame.origin_x + r.w).min(fw);
        sy1 = (r.y - frame.origin_y + r.h).min(fh);
    }
    if sx0 >= sx1 || sy0 >= sy1 {
        return None;
    }

    let sw = (sx1 - sx0) as usize;
    let sh = (sy1 - sy0) as usize;
    let tol_sq = cfg.tolerance * cfg.tolerance;

    let matches = |lx: i32, ly: i32| -> bool {
        let idx = ((ly * fw + lx) as usize) * 4;
        if idx + 2 >= frame.rgba.len() {
            return false;
        }
        let px = Rgb {
            r: frame.rgba[idx],
            g: frame.rgba[idx + 1],
            b: frame.rgba[idx + 2],
        };
        color_dist_sq(px, cfg.target) <= tol_sq
    };

    let mut visited = vec![false; sw * sh];
    let local_idx =
        |lx: i32, ly: i32| -> usize { ((ly - sy0) as usize) * sw + (lx - sx0) as usize };

    let mut best: Option<(u64, u64, u32)> = None; // (sum_x, sum_y, area)
    let mut stack: Vec<(i32, i32)> = Vec::new();

    for y in sy0..sy1 {
        for x in sx0..sx1 {
            if visited[local_idx(x, y)] || !matches(x, y) {
                continue;
            }
            // Flood fill this component (4-connectivity).
            let (mut sum_x, mut sum_y, mut area) = (0u64, 0u64, 0u32);
            stack.clear();
            stack.push((x, y));
            visited[local_idx(x, y)] = true;
            while let Some((cx, cy)) = stack.pop() {
                sum_x += cx as u64;
                sum_y += cy as u64;
                area += 1;
                for (nx, ny) in [(cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)] {
                    if nx < sx0 || nx >= sx1 || ny < sy0 || ny >= sy1 {
                        continue;
                    }
                    let li = local_idx(nx, ny);
                    if !visited[li] && matches(nx, ny) {
                        visited[li] = true;
                        stack.push((nx, ny));
                    }
                }
            }
            if best.map(|(_, _, a)| area > a).unwrap_or(true) {
                best = Some((sum_x, sum_y, area));
            }
        }
    }

    let (sum_x, sum_y, area) = best?;
    if area < cfg.min_blob_px.max(1) {
        return None;
    }
    Some(Blob {
        x: frame.origin_x + (sum_x / area as u64) as i32,
        y: frame.origin_y + (sum_y / area as u64) as i32,
        area,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const YELLOW: Rgb = Rgb {
        r: 255,
        g: 220,
        b: 0,
    };
    const BLUE: Rgb = Rgb {
        r: 40,
        g: 90,
        b: 200,
    };

    /// Build a `w×h` RGBA buffer filled with `bg`, then paint `fg` rectangles.
    fn buf(w: u32, h: u32, bg: Rgb, rects: &[(i32, i32, i32, i32, Rgb)]) -> Vec<u8> {
        let mut data = vec![0u8; (w * h * 4) as usize];
        for y in 0..h as i32 {
            for x in 0..w as i32 {
                let mut c = bg;
                for &(rx, ry, rw, rh, fc) in rects {
                    if x >= rx && x < rx + rw && y >= ry && y < ry + rh {
                        c = fc;
                    }
                }
                let i = ((y * w as i32 + x) as usize) * 4;
                data[i] = c.r;
                data[i + 1] = c.g;
                data[i + 2] = c.b;
                data[i + 3] = 255;
            }
        }
        data
    }

    fn cfg(target: Rgb, tol: u32, min: u32) -> ColorMatchConfig {
        ColorMatchConfig {
            target,
            tolerance: tol,
            region: None,
            min_blob_px: min,
        }
    }

    #[test]
    fn finds_centroid_of_single_blob() {
        // 10x10 yellow square at (20,20) on a blue field.
        let data = buf(100, 100, BLUE, &[(20, 20, 10, 10, YELLOW)]);
        let frame = Frame {
            origin_x: 0,
            origin_y: 0,
            width: 100,
            height: 100,
            rgba: &data,
        };
        let blob = find_largest_blob(&frame, &cfg(YELLOW, 40, 1)).unwrap();
        // Centroid of [20,30) is ~24.5 → 24.
        assert!((blob.x - 24).abs() <= 1);
        assert!((blob.y - 24).abs() <= 1);
        assert_eq!(blob.area, 100);
    }

    #[test]
    fn picks_the_larger_of_two_blobs() {
        let data = buf(
            120,
            60,
            BLUE,
            &[(5, 5, 4, 4, YELLOW), (60, 20, 20, 20, YELLOW)],
        );
        let frame = Frame {
            origin_x: 0,
            origin_y: 0,
            width: 120,
            height: 60,
            rgba: &data,
        };
        let blob = find_largest_blob(&frame, &cfg(YELLOW, 40, 1)).unwrap();
        // Larger blob spans [60,80)x[20,40) → centroid ~ (69,29).
        assert!((blob.x - 69).abs() <= 1);
        assert!((blob.y - 29).abs() <= 1);
        assert_eq!(blob.area, 400);
    }

    #[test]
    fn min_blob_px_filters_noise() {
        let data = buf(50, 50, BLUE, &[(10, 10, 2, 2, YELLOW)]);
        let frame = Frame {
            origin_x: 0,
            origin_y: 0,
            width: 50,
            height: 50,
            rgba: &data,
        };
        // 4-pixel blob, require >= 16 → filtered out.
        assert!(find_largest_blob(&frame, &cfg(YELLOW, 40, 16)).is_none());
    }

    #[test]
    fn centroid_maps_to_global_screen_coords() {
        let data = buf(40, 40, BLUE, &[(10, 10, 10, 10, YELLOW)]);
        let frame = Frame {
            origin_x: 2560, // secondary monitor to the right
            origin_y: 0,
            width: 40,
            height: 40,
            rgba: &data,
        };
        let blob = find_largest_blob(&frame, &cfg(YELLOW, 40, 1)).unwrap();
        assert!(blob.x >= 2560);
    }

    #[test]
    fn region_limits_the_search() {
        // Two blobs; region excludes the larger one, so the smaller wins.
        let data = buf(
            100,
            100,
            BLUE,
            &[(5, 5, 6, 6, YELLOW), (70, 70, 20, 20, YELLOW)],
        );
        let frame = Frame {
            origin_x: 0,
            origin_y: 0,
            width: 100,
            height: 100,
            rgba: &data,
        };
        let mut c = cfg(YELLOW, 40, 1);
        c.region = Some(Rect {
            x: 0,
            y: 0,
            w: 40,
            h: 40,
        });
        let blob = find_largest_blob(&frame, &c).unwrap();
        assert_eq!(blob.area, 36); // the small blob inside the region
    }

    #[test]
    fn shrunk_blob_centroid_stays_centered() {
        // Rotation/scale invariance: a smaller concentric blob still centers.
        let big = buf(60, 60, BLUE, &[(20, 20, 20, 20, YELLOW)]);
        let small = buf(60, 60, BLUE, &[(27, 27, 6, 6, YELLOW)]);
        let f = |d: &[u8]| {
            find_largest_blob(
                &Frame {
                    origin_x: 0,
                    origin_y: 0,
                    width: 60,
                    height: 60,
                    rgba: d,
                },
                &cfg(YELLOW, 40, 1),
            )
            .unwrap()
        };
        let b1 = f(&big);
        let b2 = f(&small);
        assert!((b1.x - b2.x).abs() <= 1 && (b1.y - b2.y).abs() <= 1);
    }
}
