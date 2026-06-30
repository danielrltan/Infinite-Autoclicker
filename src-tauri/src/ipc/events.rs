//! Event names (Rust → UI) and their payloads. Names must match
//! src/lib/ipc.ts `EVENTS`. See SPEC §4.

use serde::Serialize;

use crate::model::{Event, Macro};

pub mod names {
    pub const RECORDING_EVENT_ADDED: &str = "recording:event-added";
    pub const RECORDING_STOPPED: &str = "recording:stopped";
    pub const PLAYBACK_PROGRESS: &str = "playback:progress";
    pub const PLAYBACK_FINISHED: &str = "playback:finished";
    pub const STATUS_CHANGED: &str = "status:changed";
    pub const HOTKEY_TRIGGERED: &str = "hotkey:triggered";
    pub const REGION_CAPTURED: &str = "region:captured";
    pub const REGION_CAPTURE_CANCELLED: &str = "region:capture-cancelled";
    pub const ERROR: &str = "error";
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AppState {
    Idle,
    Recording,
    Playing,
    Scheduled,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum FinishReason {
    Done,
    Stopped,
    Panic,
    Error,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum HotkeyAction {
    Record,
    PlayStop,
    Capture,
    Panic,
}

#[derive(Debug, Clone, Serialize)]
pub struct RecordingEventAdded {
    pub count: usize,
    pub last_event: Event,
}

#[derive(Debug, Clone, Serialize)]
pub struct RecordingStopped {
    #[serde(rename = "macro")]
    pub macro_: Macro,
}

#[derive(Debug, Clone, Copy, Serialize)]
pub struct PlaybackProgress {
    pub loop_index: u32,
    pub event_index: usize,
    pub total_events: usize,
    pub total_loops: Option<u32>,
}

#[derive(Debug, Clone, Copy, Serialize)]
pub struct PlaybackFinished {
    pub loops_completed: u32,
    pub reason: FinishReason,
}

#[derive(Debug, Clone, Copy, Serialize)]
pub struct StatusChanged {
    pub state: AppState,
}

#[derive(Debug, Clone, Copy, Serialize)]
pub struct HotkeyTriggered {
    pub action: HotkeyAction,
}

#[derive(Debug, Clone, Serialize)]
pub struct ErrorPayload {
    pub code: String,
    pub message: String,
}
