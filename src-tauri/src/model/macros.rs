//! The single representation everything plays back: an ordered list of
//! timestamped input events. Step Builder *generates* this; Recorder *captures*
//! it; Player consumes it. See SPEC §6 and §9.

use super::vision::ColorMatchConfig;
use serde::{Deserialize, Serialize};

pub const MACRO_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MouseButton {
    Left,
    Right,
    Middle,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum KeyAction {
    Press,
    Release,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Source {
    Recorded,
    Built,
}

/// The kind of an event. Serialized internally-tagged on `kind` and flattened
/// onto the parent `Event`, so JSON reads `{ "t":0, "kind":"move", "x":..,"y":..}`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum EventKind {
    Move {
        x: i32,
        y: i32,
    },
    Down {
        button: MouseButton,
        x: i32,
        y: i32,
    },
    Up {
        button: MouseButton,
        x: i32,
        y: i32,
    },
    /// Convenience for built macros: expands to `count`× (Down, Up).
    Click {
        button: MouseButton,
        x: i32,
        y: i32,
        count: u8,
    },
    /// Convenience for built macros: expands to Down → interpolated Moves → Up.
    Drag {
        button: MouseButton,
        from: (i32, i32),
        to: (i32, i32),
        duration_ms: u64,
    },
    Key {
        code: String,
        action: KeyAction,
    },
    /// Mouse wheel scroll at a point. `dy` > 0 scrolls up, `dx` > 0 scrolls right.
    Scroll {
        x: i32,
        y: i32,
        dx: i32,
        dy: i32,
    },
    /// Explicit pause (built macros).
    Wait {
        ms: u64,
    },
    /// Find the largest blob of a target color on screen and click it. The click
    /// position is resolved at *playback time* from the live screen — so it tracks
    /// targets that move between runs. Skips if not found within `timeout_ms`.
    FindColor {
        #[serde(rename = "match")]
        match_cfg: ColorMatchConfig,
        button: MouseButton,
        /// Clicks to perform once found (1 = single, 2 = double).
        count: u8,
        /// Move the cursor onto the target before clicking.
        move_before: bool,
        /// Keep scanning up to this long for the color (0 = a single attempt).
        timeout_ms: u32,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Event {
    /// Milliseconds from macro start (monotonically non-decreasing).
    pub t: u64,
    #[serde(flatten)]
    pub kind: EventKind,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct MacroSettings {
    /// 0 = infinite.
    pub repeat: u32,
    /// 1.0 = realtime.
    pub speed: f32,
}

impl Default for MacroSettings {
    fn default() -> Self {
        Self {
            repeat: 1,
            speed: 1.0,
        }
    }
}

/// A monitor's geometry, in global virtual-desktop physical pixels. Stored on
/// the macro so playback can sanity-check the display layout (SPEC §7).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Monitor {
    pub id: u32,
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
    pub scale: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Macro {
    pub version: u32,
    pub name: String,
    /// ISO 8601.
    pub created: String,
    pub source: Source,
    pub settings: MacroSettings,
    #[serde(default)]
    pub monitors: Vec<Monitor>,
    pub events: Vec<Event>,
}

impl Macro {
    pub fn empty(name: impl Into<String>, source: Source) -> Self {
        Self {
            version: MACRO_VERSION,
            name: name.into(),
            created: crate::util::now_iso8601(),
            source,
            settings: MacroSettings::default(),
            monitors: Vec::new(),
            events: Vec::new(),
        }
    }
}

/// Lightweight listing entry for the library (SPEC §F7).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MacroMeta {
    pub name: String,
    pub path: String,
    pub source: Source,
    pub event_count: usize,
    pub created: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::vision::{ColorMatchConfig, Rgb};

    #[test]
    fn findcolor_event_serde_contract() {
        let ev = Event {
            t: 250,
            kind: EventKind::FindColor {
                match_cfg: ColorMatchConfig {
                    target: Rgb {
                        r: 255,
                        g: 220,
                        b: 0,
                    },
                    tolerance: 60,
                    regions: vec![],
                    min_blob_px: 40,
                },
                button: MouseButton::Left,
                count: 1,
                move_before: true,
                timeout_ms: 0,
            },
        };
        let json = serde_json::to_string(&ev).unwrap();
        // Flattened, tagged on `kind`; the match config is under "match".
        assert!(json.contains("\"kind\":\"findcolor\""), "{json}");
        assert!(json.contains("\"match\":"), "{json}");
        let back: Event = serde_json::from_str(&json).unwrap();
        assert_eq!(back, ev);
    }
}
