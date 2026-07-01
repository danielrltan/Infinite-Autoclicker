// Typed wrappers over Tauri `invoke` and the Rust → UI event channel.
// Command + event names must match src-tauri/src/ipc/{commands,events}.rs.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AppError,
  AutoClickOpts,
  Blob,
  ColorMatchConfig,
  ColorTriggerOpts,
  CursorPos,
  FailsafeConfig,
  HotkeyConfig,
  HotkeyTriggered,
  Macro,
  MacroMeta,
  Monitor,
  PermissionStatus,
  PlaybackFinished,
  PlaybackOpts,
  PlaybackProgress,
  PlayIntent,
  RecordOpts,
  RecordingEventAdded,
  RecordingStopped,
  Rgb,
  Schedule,
  TrashEntry,
  ScheduleInfo,
  SessionType,
  Settings,
  StatusChanged,
} from "./types";

// ── Commands ───────────────────────────────────────────────────────

export const ipc = {
  getCursorPosition: () => invoke<CursorPos>("get_cursor_position"),
  captureCursor: () => invoke<CursorPos>("capture_cursor"),
  doOneClick: () => invoke<void>("do_one_click"),

  getMonitors: () => invoke<Monitor[]>("get_monitors"),
  getSessionType: () => invoke<SessionType>("get_session_type"),

  playMacro: (macro: Macro, opts: PlaybackOpts) =>
    invoke<void>("play_macro", { mac: macro, opts }),
  stopPlayback: () => invoke<void>("stop_playback"),

  startRecording: (opts: RecordOpts) =>
    invoke<void>("start_recording", { opts }),
  stopRecording: () => invoke<Macro>("stop_recording"),

  saveMacro: (path: string, macro: Macro, overwrite: boolean) =>
    invoke<void>("save_macro", { path, mac: macro, overwrite }),
  saveMacroByName: (name: string, macro: Macro, overwrite: boolean) =>
    invoke<string>("save_macro_by_name", { name, mac: macro, overwrite }),
  macroExists: (path: string) => invoke<boolean>("macro_exists", { path }),
  loadMacro: (path: string) => invoke<Macro>("load_macro", { path }),
  listMacros: () => invoke<MacroMeta[]>("list_macros"),
  listRecent: () => invoke<MacroMeta[]>("list_recent"),
  // Soft delete → returns the trash entry so the UI can offer Undo.
  deleteMacro: (path: string) => invoke<TrashEntry>("delete_macro", { path }),
  listTrash: () => invoke<TrashEntry[]>("list_trash"),
  restoreMacro: (token: string) => invoke<string>("restore_macro", { token }),
  purgeTrash: (token: string) => invoke<void>("purge_trash", { token }),
  defaultMacroDir: () => invoke<string>("default_macro_dir"),

  scheduleMacro: (macro: Macro, schedule: Schedule) =>
    invoke<string>("schedule_macro", { mac: macro, schedule }),
  cancelSchedule: (id: string) => invoke<void>("cancel_schedule", { id }),
  listSchedules: () => invoke<ScheduleInfo[]>("list_schedules"),

  getHotkeys: () => invoke<HotkeyConfig>("get_hotkeys"),
  setHotkeys: (cfg: HotkeyConfig) => invoke<void>("set_hotkeys", { cfg }),
  hotkeyConflicts: (cfg: HotkeyConfig) =>
    invoke<string[]>("hotkey_conflicts", { cfg }),

  getFailsafeConfig: () => invoke<FailsafeConfig>("get_failsafe_config"),
  setFailsafeConfig: (cfg: FailsafeConfig) =>
    invoke<void>("set_failsafe_config", { cfg }),

  getSettings: () => invoke<Settings>("get_settings"),
  setSettings: (settings: Settings) => invoke<void>("set_settings", { settings }),

  getPermissionStatus: () => invoke<PermissionStatus>("get_permission_status"),
  openPermissionSettings: (which: "accessibility" | "input_monitoring") =>
    invoke<void>("open_permission_settings", { which }),

  // Color Trigger (vision)
  pickColorAt: (x: number, y: number) =>
    invoke<Rgb | null>("pick_color_at", { x, y }),
  captureCursorColor: () => invoke<Rgb | null>("capture_cursor_color"),
  findColorOnce: (cfg: ColorMatchConfig) =>
    invoke<Blob | null>("find_color_once", { cfg }),
  startColorTrigger: (opts: ColorTriggerOpts) =>
    invoke<void>("start_color_trigger", { opts }),
  stopColorTrigger: () => invoke<void>("stop_color_trigger"),

  // Auto Clicker
  startAutoclick: (opts: AutoClickOpts) =>
    invoke<void>("start_autoclick", { opts }),
  stopAutoclick: () => invoke<void>("stop_autoclick"),

  // Background-hotkey intent caches (so record/play hotkeys work when minimized)
  setRecordOpts: (opts: RecordOpts) => invoke<void>("set_record_opts", { opts }),
  setPlayIntent: (intent: PlayIntent) =>
    invoke<void>("set_play_intent", { intent }),

  // Drag-to-select screen region (Color Trigger)
  startRegionCapture: () => invoke<void>("start_region_capture"),
  cancelRegionCapture: () => invoke<void>("cancel_region_capture"),
};

// ── Events (Rust → UI) ─────────────────────────────────────────────

export const EVENTS = {
  recordingEventAdded: "recording:event-added",
  recordingStopped: "recording:stopped",
  playbackProgress: "playback:progress",
  playbackFinished: "playback:finished",
  statusChanged: "status:changed",
  hotkeyTriggered: "hotkey:triggered",
  error: "error",
} as const;

type Handlers = {
  onRecordingEventAdded?: (p: RecordingEventAdded) => void;
  onRecordingStopped?: (p: RecordingStopped) => void;
  onPlaybackProgress?: (p: PlaybackProgress) => void;
  onPlaybackFinished?: (p: PlaybackFinished) => void;
  onStatusChanged?: (p: StatusChanged) => void;
  onHotkeyTriggered?: (p: HotkeyTriggered) => void;
  onError?: (p: AppError) => void;
};

/** Subscribe to all backend events. Returns an unsubscribe fn. */
export async function subscribe(h: Handlers): Promise<UnlistenFn> {
  const unlisteners: UnlistenFn[] = [];
  const add = async <T>(name: string, cb?: (p: T) => void) => {
    if (!cb) return;
    unlisteners.push(await listen<T>(name, (e) => cb(e.payload)));
  };

  await add<RecordingEventAdded>(
    EVENTS.recordingEventAdded,
    h.onRecordingEventAdded,
  );
  await add<RecordingStopped>(EVENTS.recordingStopped, h.onRecordingStopped);
  await add<PlaybackProgress>(EVENTS.playbackProgress, h.onPlaybackProgress);
  await add<PlaybackFinished>(EVENTS.playbackFinished, h.onPlaybackFinished);
  await add<StatusChanged>(EVENTS.statusChanged, h.onStatusChanged);
  await add<HotkeyTriggered>(EVENTS.hotkeyTriggered, h.onHotkeyTriggered);
  await add<AppError>(EVENTS.error, h.onError);

  return () => unlisteners.forEach((u) => u());
}
