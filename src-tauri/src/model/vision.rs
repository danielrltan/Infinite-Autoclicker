//! Color-match configuration, shared by the Color Trigger and the "click color"
//! step. A color step serializes its `ColorMatchConfig` into the saved macro, so
//! this config is part of the file format and belongs in the domain model. The
//! detection logic (blob finding) lives in `engine/vision.rs`.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Rgb {
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

/// A screen-coordinate rectangle in the input-event space (logical points on
/// macOS, physical px on Windows) - the same space as recorded click positions.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ColorMatchConfig {
    pub target: Rgb,
    /// Euclidean RGB distance threshold (0–441). ~30–80 works for vivid colors.
    pub tolerance: u32,
    /// Search regions in screen coords; empty scans the whole captured frame.
    #[serde(default)]
    pub regions: Vec<Rect>,
    /// Ignore blobs smaller than this many matched pixels (noise filter).
    pub min_blob_px: u32,
}
