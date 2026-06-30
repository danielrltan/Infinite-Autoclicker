//! Infinite Autoclicker — Tauri core library.
//!
//! Privacy guarantee (SPEC §F9): this crate makes **no** network calls. No HTTP
//! client crate is a dependency; CI enforces the deny-list.

pub mod core;
pub mod engine;
pub mod input;
pub mod ipc;
pub mod model;
pub mod storage;
pub mod util;

use std::sync::mpsc;
use std::sync::Arc;

use tauri::Manager;

use crate::core::{start_consumer, AppCore};
use crate::input::cursor::CursorTracker;
use crate::input::listener::spawn_listener;
use crate::ipc::commands;
use crate::ipc::events::{names, ErrorPayload};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            let handle = app.handle().clone();

            // Load persisted settings before constructing the core.
            let settings = commands::load_settings(&handle);

            // Global listener → single consumer (SPEC §4).
            let cursor = Arc::new(CursorTracker::new());
            let (tx, rx) = mpsc::channel();
            {
                let err_handle = handle.clone();
                spawn_listener(Arc::clone(&cursor), tx, move |msg| {
                    use tauri::Emitter;
                    let _ = err_handle.emit(
                        names::ERROR,
                        ErrorPayload {
                            code: "listener".into(),
                            message: msg,
                        },
                    );
                });
            }

            let core = AppCore::new(handle.clone(), cursor, settings);
            app.manage(core.clone());
            start_consumer(core, handle, rx);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_cursor_position,
            commands::capture_cursor,
            commands::do_one_click,
            commands::get_monitors,
            commands::get_session_type,
            commands::play_macro,
            commands::stop_playback,
            commands::start_recording,
            commands::stop_recording,
            commands::default_macro_dir,
            commands::save_macro,
            commands::load_macro,
            commands::list_macros,
            commands::delete_macro,
            commands::list_recent,
            commands::schedule_macro,
            commands::cancel_schedule,
            commands::list_schedules,
            commands::get_hotkeys,
            commands::set_hotkeys,
            commands::hotkey_conflicts,
            commands::get_failsafe_config,
            commands::set_failsafe_config,
            commands::get_settings,
            commands::set_settings,
            commands::get_permission_status,
            commands::open_permission_settings,
            commands::pick_color_at,
            commands::capture_cursor_color,
            commands::find_color_once,
            commands::start_color_trigger,
            commands::stop_color_trigger,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Infinite Autoclicker");
}
