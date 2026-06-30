// Mirrors the Rust domain model in src-tauri/src/model/*. Keep in sync.
// Serde uses internally-tagged enums (`tag = "kind"`/`"action"`) flattened onto
// the parent, and lowercase variant names — see SPEC §6 and §9.

export type MouseButton = "left" | "right" | "middle";
export type KeyAction = "press" | "release";
export type Source = "recorded" | "built";

/** The single playback unit. Discriminated on `kind`. */
export type EventKind =
  | { kind: "move"; x: number; y: number }
  | { kind: "down"; button: MouseButton; x: number; y: number }
  | { kind: "up"; button: MouseButton; x: number; y: number }
  | { kind: "click"; button: MouseButton; x: number; y: number; count: number }
  | {
      kind: "drag";
      button: MouseButton;
      from: [number, number];
      to: [number, number];
      duration_ms: number;
    }
  | { kind: "key"; code: string; action: KeyAction }
  | { kind: "wait"; ms: number };

/** `t` = milliseconds from macro start (monotonically non-decreasing). */
export type MacroEvent = { t: number } & EventKind;

export interface MacroSettings {
  /** 0 = infinite */
  repeat: number;
  /** 1.0 = realtime */
  speed: number;
}

export interface Monitor {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  scale: number;
}

export interface JitterConfig {
  /** radius in px; 0 = off */
  position_radius_px: number;
  /** 0.0 = off; e.g. 0.15 = +/-15% */
  timing_pct: number;
  /** 0 = off (full-motion / drag only) */
  path_deviation_px: number;
}

export interface Macro {
  version: number; // current = 1
  name: string;
  created: string; // ISO 8601
  source: Source;
  settings: MacroSettings;
  monitors: Monitor[];
  events: MacroEvent[];
}

export interface MacroMeta {
  name: string;
  path: string;
  source: Source;
  event_count: number;
  created: string;
}

/** A soft-deleted macro in the trash (recoverable). Mirrors Rust TrashEntry. */
export interface TrashEntry {
  token: string;
  original_name: string;
  original_path: string;
  trashed_at: string;
  event_count: number;
}

// ── Playback / recording options ───────────────────────────────────

export interface PlaybackOpts {
  repeat: number;
  speed: number;
  jitter: JitterConfig;
}

export type CaptureMode = "clicks_only" | "full_motion";

export interface RecordOpts {
  capture_mode: CaptureMode;
  motion_sample_ms: number;
  capture_keyboard: boolean;
}

// ── Scheduling ─────────────────────────────────────────────────────

export type Weekday =
  | "mon"
  | "tue"
  | "wed"
  | "thu"
  | "fri"
  | "sat"
  | "sun";

export type Schedule =
  | { kind: "once"; at_ms: number } // unix epoch ms (local time chosen in UI)
  | { kind: "interval"; every_ms: number; start_at_ms: number | null }
  | { kind: "weekly"; days: Weekday[]; hour: number; minute: number }; // behind flag

export interface ScheduleInfo {
  id: string;
  macro_name: string;
  schedule: Schedule;
  next_run_ms: number | null;
}

// ── Hotkeys / failsafe / settings ──────────────────────────────────

export interface HotkeyConfig {
  record_toggle: string;
  play_stop_toggle: string;
  capture_cursor: string;
  panic: string;
}

export interface FailsafeConfig {
  panic_enabled: boolean;
  corner_failsafe_enabled: boolean;
  corner_threshold_px: number;
}

export type ThemePref = "system" | "light" | "dark";

export interface Settings {
  theme: ThemePref;
  hotkeys: HotkeyConfig;
  failsafe: FailsafeConfig;
  default_speed: number;
  launch_on_startup: boolean;
  weekly_recurrence_enabled: boolean; // F4 stretch flag
}

export interface PermissionStatus {
  /** macOS: simulate input. Non-macOS reports true. */
  accessibility: boolean;
  /** macOS: record input. Non-macOS reports true. */
  input_monitoring: boolean;
}

export type SessionType = "windows" | "macos" | "x11" | "wayland" | "unknown";

export interface CursorPos {
  x: number;
  y: number;
}

// ── Auto Clicker (OP Auto Clicker / Murgee parity) ─────────────────

export interface AutoClickOpts {
  /** Delay between clicks in milliseconds (sum of the h/m/s/ms inputs). */
  interval_ms: number;
  button: MouseButton;
  /** 1 = single, 2 = double, 3 = triple. */
  clicks_per_event: number;
  /** 0 = repeat until stopped. */
  repeat: number;
  /** false = click at the current cursor location (don't move it). */
  use_fixed_pos: boolean;
  x: number;
  y: number;
  /** Randomize each interval ±pct (0 = off). */
  jitter_time_pct: number;
  /** Random position offset radius px, fixed-position only (0 = off). */
  jitter_pos_px: number;
  /** Key-presser mode: press this key code each tick instead of clicking. */
  key_code: string | null;
}

// ── Color Trigger / vision (owner request) ─────────────────────────

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ColorMatchConfig {
  target: Rgb;
  /** Euclidean RGB distance threshold (0–441). */
  tolerance: number;
  region: Rect | null;
  min_blob_px: number;
}

export interface Blob {
  x: number;
  y: number;
  area: number;
}

export interface ColorTriggerOpts {
  match: ColorMatchConfig;
  interval_ms: number;
  button: MouseButton;
  move_before_click: boolean;
}

// ── App status / event payloads (Rust → UI) ────────────────────────

export type AppState = "idle" | "recording" | "playing" | "scheduled";

export type PlaybackFinishReason = "done" | "stopped" | "panic" | "error";

export interface RecordingEventAdded {
  count: number;
  last_event: MacroEvent;
}
export interface RecordingStopped {
  macro: Macro;
}
export interface PlaybackProgress {
  loop_index: number;
  event_index: number;
  total_events: number;
  total_loops: number | null;
}
export interface PlaybackFinished {
  loops_completed: number;
  reason: PlaybackFinishReason;
}
export interface StatusChanged {
  state: AppState;
}
export interface HotkeyTriggered {
  action: "record" | "play_stop" | "capture" | "panic";
}
export interface AppError {
  code: string;
  message: string;
}
