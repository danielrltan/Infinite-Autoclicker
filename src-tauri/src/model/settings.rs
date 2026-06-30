//! Settings, hotkeys, failsafe, scheduling, and playback/record options.
//! Mirrors src/lib/types.ts. See SPEC §4, §F4, §F5, §F6, §F8.

use serde::{Deserialize, Serialize};

// ── Jitter (SPEC §F3a) ─────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct JitterConfig {
    /// 0 = off.
    pub position_radius_px: u32,
    /// 0.0 = off; e.g. 0.15 = +/-15%.
    pub timing_pct: f32,
    /// 0 = off (full-motion / drag only).
    pub path_deviation_px: u32,
}

impl Default for JitterConfig {
    fn default() -> Self {
        Self {
            position_radius_px: 0,
            timing_pct: 0.0,
            path_deviation_px: 0,
        }
    }
}

impl JitterConfig {
    pub fn is_off(&self) -> bool {
        self.position_radius_px == 0 && self.timing_pct == 0.0 && self.path_deviation_px == 0
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct PlaybackOpts {
    pub repeat: u32,
    pub speed: f32,
    #[serde(default)]
    pub jitter: JitterConfig,
}

impl Default for PlaybackOpts {
    fn default() -> Self {
        Self {
            repeat: 1,
            speed: 1.0,
            jitter: JitterConfig::default(),
        }
    }
}

// ── Recording (SPEC §F2) ───────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CaptureMode {
    ClicksOnly,
    FullMotion,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct RecordOpts {
    pub capture_mode: CaptureMode,
    pub motion_sample_ms: u64,
    pub capture_keyboard: bool,
}

impl Default for RecordOpts {
    fn default() -> Self {
        Self {
            capture_mode: CaptureMode::FullMotion,
            motion_sample_ms: 15,
            capture_keyboard: true,
        }
    }
}

// ── Scheduling (SPEC §F4) ──────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Weekday {
    Mon,
    Tue,
    Wed,
    Thu,
    Fri,
    Sat,
    Sun,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Schedule {
    /// Unix epoch milliseconds.
    Once { at_ms: i64 },
    Interval {
        every_ms: i64,
        start_at_ms: Option<i64>,
    },
    /// Behind `weekly_recurrence_enabled` flag.
    Weekly {
        days: Vec<Weekday>,
        hour: u8,
        minute: u8,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleInfo {
    pub id: String,
    pub macro_name: String,
    pub schedule: Schedule,
    pub next_run_ms: Option<i64>,
}

// ── Hotkeys / failsafe (SPEC §F5, §F6) ─────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HotkeyConfig {
    pub record_toggle: String,
    pub play_stop_toggle: String,
    pub capture_cursor: String,
    pub panic: String,
}

impl Default for HotkeyConfig {
    fn default() -> Self {
        Self {
            record_toggle: "F5".into(),
            play_stop_toggle: "F6".into(),
            capture_cursor: "F7".into(),
            panic: "F12".into(),
        }
    }
}

impl HotkeyConfig {
    /// All configured hotkey codes — used so the recorder never records a hotkey.
    pub fn codes(&self) -> [&str; 4] {
        [
            &self.record_toggle,
            &self.play_stop_toggle,
            &self.capture_cursor,
            &self.panic,
        ]
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct FailsafeConfig {
    pub panic_enabled: bool,
    pub corner_failsafe_enabled: bool,
    pub corner_threshold_px: u32,
}

impl Default for FailsafeConfig {
    fn default() -> Self {
        Self {
            panic_enabled: true,
            corner_failsafe_enabled: true,
            corner_threshold_px: 5,
        }
    }
}

// ── App settings (SPEC §F8) ────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ThemePref {
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Settings {
    pub theme: ThemePref,
    pub hotkeys: HotkeyConfig,
    pub failsafe: FailsafeConfig,
    pub default_speed: f32,
    pub launch_on_startup: bool,
    pub weekly_recurrence_enabled: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: ThemePref::System,
            hotkeys: HotkeyConfig::default(),
            failsafe: FailsafeConfig::default(),
            default_speed: 1.0,
            launch_on_startup: false,
            weekly_recurrence_enabled: false,
        }
    }
}

// ── Misc IPC payloads ──────────────────────────────────────────────

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct PermissionStatus {
    pub accessibility: bool,
    pub input_monitoring: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct CursorPos {
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SessionType {
    Windows,
    Macos,
    X11,
    Wayland,
    Unknown,
}
