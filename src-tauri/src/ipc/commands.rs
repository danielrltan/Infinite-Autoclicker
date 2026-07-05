//! All `#[tauri::command]` functions - the typed IPC surface (SPEC §4).
//! Mirrors src/lib/ipc.ts.

use std::path::PathBuf;

use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_store::StoreExt;

use crate::core::{current_monitors, AppCore, PlayIntent};
use crate::engine::autoclick::AutoClickOpts;
use crate::engine::color_trigger::ColorTriggerOpts;
use crate::engine::hotkeys::conflicts;
use crate::engine::screen;
use crate::engine::vision::{Blob, ColorMatchConfig, Rgb};
use crate::ipc::events::{names, AppState, RecordingStopped};
use crate::model::{
    CursorPos, FailsafeConfig, HotkeyConfig, Macro, MacroMeta, Monitor, PermissionStatus,
    PlaybackOpts, RecordOpts, Schedule, ScheduleInfo, SessionType, Settings, Source,
};
use crate::storage::TrashEntry;

const SETTINGS_FILE: &str = "settings.json";
const RECENT_KEY: &str = "recent";
const SETTINGS_KEY: &str = "settings";
const MAX_RECENT: usize = 12;

// ── Cursor / input core (M1) ───────────────────────────────────────

#[tauri::command]
pub fn get_cursor_position(core: State<AppCore>) -> CursorPos {
    let (x, y) = core.cursor.get();
    CursorPos { x, y }
}

#[tauri::command]
pub fn capture_cursor(core: State<AppCore>) -> CursorPos {
    let (x, y) = core.cursor.get();
    CursorPos { x, y }
}

#[tauri::command]
pub fn do_one_click(core: State<AppCore>) -> Result<(), String> {
    use crate::model::{KeyAction, MouseButton};
    core.backend
        .button(MouseButton::Left, KeyAction::Press)
        .map_err(|e| e.to_string())?;
    core.backend
        .button(MouseButton::Left, KeyAction::Release)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_monitors(app: AppHandle, core: State<AppCore>) -> Vec<Monitor> {
    core.refresh_monitors(&app)
}

#[tauri::command]
pub fn get_session_type() -> SessionType {
    #[cfg(target_os = "windows")]
    {
        SessionType::Windows
    }
    #[cfg(target_os = "macos")]
    {
        SessionType::Macos
    }
    #[cfg(target_os = "linux")]
    {
        let session = std::env::var("XDG_SESSION_TYPE").unwrap_or_default();
        let wayland = std::env::var("WAYLAND_DISPLAY").is_ok();
        if session.eq_ignore_ascii_case("wayland") || wayland {
            SessionType::Wayland
        } else {
            SessionType::X11
        }
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        SessionType::Unknown
    }
}

// ── Playback (M2/M3) ───────────────────────────────────────────────

#[tauri::command]
pub fn play_macro(app: AppHandle, core: State<AppCore>, mac: Macro, opts: PlaybackOpts) {
    core.start_playback(&app, mac, opts);
}

#[tauri::command]
pub fn stop_playback(core: State<AppCore>) {
    core.stop_all();
}

// ── Recording (M3) ─────────────────────────────────────────────────

#[tauri::command]
pub fn start_recording(app: AppHandle, core: State<AppCore>, opts: RecordOpts) {
    // Ignore if already recording, so a double-start can't reset the buffer.
    if core.recorder.is_active() {
        return;
    }
    core.recorder.start(opts);
    core.set_status(&app, AppState::Recording);
}

/// Safe to call anytime: if not recording it's a no-op (returns an empty macro
/// and emits nothing), so a "stop" never wipes the current events by accident.
#[tauri::command]
pub fn stop_recording(app: AppHandle, core: State<AppCore>) -> Macro {
    if !core.recorder.is_active() {
        return crate::model::Macro::empty("Recorded macro", crate::model::Source::Recorded);
    }
    let monitors = current_monitors(&app);
    let m = core.recorder.stop("Recorded macro", monitors);
    core.set_status(&app, AppState::Idle);
    let _ = app.emit(
        names::RECORDING_STOPPED,
        RecordingStopped { macro_: m.clone() },
    );
    m
}

// ── Files / library (M5) ───────────────────────────────────────────

fn macro_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("macros");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command]
pub fn default_macro_dir(app: AppHandle) -> Result<String, String> {
    Ok(macro_dir(&app)?.to_string_lossy().to_string())
}

/// Open the macros folder in the OS file manager (local only, no network).
#[tauri::command]
pub fn reveal_macro_folder(app: AppHandle) -> Result<(), String> {
    let dir = macro_dir(&app)?;
    open_in_file_manager(&dir).map_err(|e| e.to_string())
}

fn open_in_file_manager(path: &std::path::Path) -> std::io::Result<()> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer").arg(path).spawn()?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg(path).spawn()?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open").arg(path).spawn()?;
    }
    Ok(())
}

#[tauri::command]
pub fn save_macro(app: AppHandle, path: String, mac: Macro, overwrite: bool) -> Result<(), String> {
    let dest =
        crate::storage::save_macro_guarded(&path, &mac, overwrite).map_err(|e| e.to_string())?;
    push_recent(&app, &dest.to_string_lossy());
    Ok(())
}

/// Build the canonical path under the macros dir in Rust (the frontend passes a
/// bare name, never a concatenated path - fixes the mixed-separator save bug).
#[tauri::command]
pub fn save_macro_by_name(
    app: AppHandle,
    name: String,
    mac: Macro,
    overwrite: bool,
) -> Result<String, String> {
    let dir = macro_dir(&app)?;
    let dest = crate::storage::canonical_macro_path(&dir, &name);
    let written = crate::storage::save_macro_guarded(&dest.to_string_lossy(), &mac, overwrite)
        .map_err(|e| e.to_string())?;
    let s = written.to_string_lossy().into_owned();
    push_recent(&app, &s);
    Ok(s)
}

#[tauri::command]
pub fn macro_exists(path: String) -> bool {
    crate::storage::macro_exists(&path)
}

#[tauri::command]
pub fn load_macro(app: AppHandle, path: String) -> Result<Macro, String> {
    let m = crate::storage::load_macro(&path).map_err(|e| e.to_string())?;
    push_recent(&app, &path);
    Ok(m)
}

#[tauri::command]
pub fn list_macros(app: AppHandle) -> Result<Vec<MacroMeta>, String> {
    Ok(crate::storage::list_macros_in_dir(&macro_dir(&app)?))
}

/// Soft delete: moves the macro into `<macros_dir>/.trash/` and returns the
/// trash entry so the UI can offer Undo. Recoverable until purged.
#[tauri::command]
pub fn delete_macro(app: AppHandle, path: String) -> Result<TrashEntry, String> {
    let entry = crate::storage::soft_delete_macro(&path).map_err(|e| e.to_string())?;
    remove_recent(&app, &path);
    Ok(entry)
}

#[tauri::command]
pub fn list_trash(app: AppHandle) -> Result<Vec<TrashEntry>, String> {
    Ok(crate::storage::list_trash(&macro_dir(&app)?))
}

/// Restore by token; returns the final path (differs if the original was taken).
#[tauri::command]
pub fn restore_macro(app: AppHandle, token: String) -> Result<String, String> {
    let dest =
        crate::storage::restore_trash(&macro_dir(&app)?, &token).map_err(|e| e.to_string())?;
    let s = dest.to_string_lossy().into_owned();
    push_recent(&app, &s);
    Ok(s)
}

#[tauri::command]
pub fn purge_trash(app: AppHandle, token: String) -> Result<(), String> {
    crate::storage::purge_trash(&macro_dir(&app)?, &token).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_recent(app: AppHandle) -> Vec<MacroMeta> {
    let paths = recent_paths(&app);
    paths
        .iter()
        .filter_map(|p| {
            let m = crate::storage::load_macro(p).ok()?;
            Some(MacroMeta {
                name: m.name,
                path: p.clone(),
                source: m.source,
                event_count: m.events.len(),
                created: m.created,
            })
        })
        .collect()
}

fn recent_paths(app: &AppHandle) -> Vec<String> {
    let Ok(store) = app.store(SETTINGS_FILE) else {
        return Vec::new();
    };
    store
        .get(RECENT_KEY)
        .and_then(|v| serde_json::from_value::<Vec<String>>(v).ok())
        .unwrap_or_default()
}

fn push_recent(app: &AppHandle, path: &str) {
    let Ok(store) = app.store(SETTINGS_FILE) else {
        return;
    };
    let mut paths = recent_paths(app);
    paths.retain(|p| p != path);
    paths.insert(0, path.to_string());
    paths.truncate(MAX_RECENT);
    store.set(RECENT_KEY, serde_json::json!(paths));
    let _ = store.save();
}

fn remove_recent(app: &AppHandle, path: &str) {
    let Ok(store) = app.store(SETTINGS_FILE) else {
        return;
    };
    let mut paths = recent_paths(app);
    paths.retain(|p| p != path);
    store.set(RECENT_KEY, serde_json::json!(paths));
    let _ = store.save();
}

// ── Scheduler (M6) ─────────────────────────────────────────────────

#[tauri::command]
pub fn schedule_macro(
    core: State<AppCore>,
    mac: Macro,
    schedule: Schedule,
) -> Result<String, String> {
    if matches!(schedule, Schedule::Weekly { .. })
        && !core.settings.lock().unwrap().weekly_recurrence_enabled
    {
        return Err("Weekly recurrence is disabled. Enable it in Settings.".into());
    }
    let opts = PlaybackOpts {
        repeat: mac.settings.repeat,
        speed: mac.settings.speed,
        jitter: Default::default(),
    };
    Ok(core.scheduler.arm(mac, schedule, opts))
}

#[tauri::command]
pub fn cancel_schedule(core: State<AppCore>, id: String) {
    core.scheduler.cancel(&id);
}

#[tauri::command]
pub fn list_schedules(core: State<AppCore>) -> Vec<ScheduleInfo> {
    core.scheduler.list()
}

// ── Hotkeys / failsafe / settings (M4/M8) ──────────────────────────

#[tauri::command]
pub fn get_hotkeys(core: State<AppCore>) -> HotkeyConfig {
    core.hotkeys.get()
}

#[tauri::command]
pub fn set_hotkeys(app: AppHandle, core: State<AppCore>, cfg: HotkeyConfig) {
    core.hotkeys.set(cfg.clone());
    {
        let mut s = core.settings.lock().unwrap();
        s.hotkeys = cfg;
        persist_settings(&app, &s);
    }
}

#[tauri::command]
pub fn hotkey_conflicts(cfg: HotkeyConfig) -> Vec<String> {
    conflicts(&cfg)
}

#[tauri::command]
pub fn get_failsafe_config(core: State<AppCore>) -> FailsafeConfig {
    core.settings.lock().unwrap().failsafe
}

#[tauri::command]
pub fn set_failsafe_config(app: AppHandle, core: State<AppCore>, cfg: FailsafeConfig) {
    let mut s = core.settings.lock().unwrap();
    s.failsafe = cfg;
    persist_settings(&app, &s);
}

#[tauri::command]
pub fn get_settings(core: State<AppCore>) -> Settings {
    core.settings.lock().unwrap().clone()
}

#[tauri::command]
pub fn set_settings(app: AppHandle, core: State<AppCore>, settings: Settings) {
    core.hotkeys.set(settings.hotkeys.clone());
    let mut s = core.settings.lock().unwrap();
    *s = settings;
    persist_settings(&app, &s);
}

pub fn persist_settings(app: &AppHandle, settings: &Settings) {
    let Ok(store) = app.store(SETTINGS_FILE) else {
        return;
    };
    if let Ok(v) = serde_json::to_value(settings) {
        store.set(SETTINGS_KEY, v);
        let _ = store.save();
    }
}

/// Load persisted settings at startup (called from lib.rs before AppCore::new).
pub fn load_settings(app: &AppHandle) -> Settings {
    let Ok(store) = app.store(SETTINGS_FILE) else {
        return Settings::default();
    };
    store
        .get(SETTINGS_KEY)
        .and_then(|v| serde_json::from_value::<Settings>(v).ok())
        .unwrap_or_default()
}

// ── macOS permissions (M4) ─────────────────────────────────────────

#[tauri::command]
pub fn get_permission_status() -> PermissionStatus {
    crate::input::permissions::permission_status()
}

#[tauri::command]
pub fn open_permission_settings(which: String) {
    crate::input::permissions::open_settings(&which);
}

// ── Color Trigger (M9, owner request) ──────────────────────────────

#[tauri::command]
pub fn pick_color_at(x: i32, y: i32) -> Result<Option<Rgb>, String> {
    screen::pixel_at(x, y)
}

#[tauri::command]
pub fn capture_cursor_color(core: State<AppCore>) -> Result<Option<Rgb>, String> {
    let (x, y) = core.cursor.get();
    screen::pixel_at(x, y)
}

#[tauri::command]
pub fn find_color_once(cfg: ColorMatchConfig) -> Result<Option<Blob>, String> {
    screen::find_color_now(&cfg)
}

#[tauri::command]
pub fn start_color_trigger(app: AppHandle, core: State<AppCore>, opts: ColorTriggerOpts) {
    core.start_color_trigger(&app, opts);
}

#[tauri::command]
pub fn stop_color_trigger(core: State<AppCore>) {
    core.color_trigger.stop();
}

// ── Auto Clicker (OP / Murgee parity) ──────────────────────────────

#[tauri::command]
pub fn start_autoclick(app: AppHandle, core: State<AppCore>, opts: AutoClickOpts) {
    core.start_autoclick(&app, opts);
}

#[tauri::command]
pub fn stop_autoclick(core: State<AppCore>) {
    core.autoclicker.stop();
}

// ── Background-hotkey intent caches (F9 record / F8 play work minimized) ────

#[tauri::command]
pub fn set_record_opts(core: State<AppCore>, opts: RecordOpts) {
    *core.record_opts.lock().unwrap() = opts;
}

#[tauri::command]
pub fn set_play_intent(core: State<AppCore>, intent: PlayIntent) {
    *core.play_intent.lock().unwrap() = intent;
}

/// Cache the latest auto-click options so the auto-click hotkey (F6) can start
/// the clicker even when the window is minimized.
#[tauri::command]
pub fn set_autoclick_opts(core: State<AppCore>, opts: AutoClickOpts) {
    *core.autoclick_opts.lock().unwrap() = Some(opts);
}

// ── Drag-to-select region capture (Color Trigger) ──────────────────

#[tauri::command]
pub fn start_region_capture(core: State<AppCore>) {
    let mut rc = core.region_capture.lock().unwrap();
    rc.active = true;
    rc.start = None;
}

#[tauri::command]
pub fn cancel_region_capture(core: State<AppCore>) {
    let mut rc = core.region_capture.lock().unwrap();
    rc.active = false;
    rc.start = None;
}

// Suppress unused warning for Source re-export used only by other modules.
#[allow(dead_code)]
fn _uses(_: Source) {}
