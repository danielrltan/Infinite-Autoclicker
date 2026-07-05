//! Global input listening (rdev only - the one API that captures system-wide
//! input). Runs on its own OS thread for the app lifetime, updating the cursor
//! tracker directly and forwarding normalized events to a single consumer
//! (HotkeyManager + Recorder + corner-failsafe live there). See SPEC §4.

use std::sync::mpsc::Sender;
use std::sync::Arc;
use std::thread;

use rdev::{Button as RButton, EventType};

use super::cursor::CursorTracker;
use super::key_codes::key_to_code;
use crate::model::{KeyAction, MouseButton};

/// A normalized, owned input event (rdev types don't cross the channel).
#[derive(Debug, Clone)]
pub enum RawInput {
    Move {
        x: i32,
        y: i32,
    },
    Button {
        button: MouseButton,
        action: KeyAction,
    },
    Key {
        code: String,
        action: KeyAction,
    },
    Wheel {
        dx: i64,
        dy: i64,
    },
}

fn map_button(b: RButton) -> Option<MouseButton> {
    match b {
        RButton::Left => Some(MouseButton::Left),
        RButton::Right => Some(MouseButton::Right),
        RButton::Middle => Some(MouseButton::Middle),
        _ => None,
    }
}

/// Spawn the global listener thread. Returns immediately; the thread runs until
/// the process exits. Errors (e.g. missing macOS Input Monitoring permission)
/// are reported via `on_error` so onboarding can react.
pub fn spawn_listener(
    cursor: Arc<CursorTracker>,
    tx: Sender<RawInput>,
    on_error: impl FnOnce(String) + Send + 'static,
) {
    thread::Builder::new()
        .name("input-listener".into())
        .spawn(move || {
            let callback = move |event: rdev::Event| match event.event_type {
                EventType::MouseMove { x, y } => {
                    let xi = x.round() as i32;
                    let yi = y.round() as i32;
                    cursor.update(xi, yi);
                    let _ = tx.send(RawInput::Move { x: xi, y: yi });
                }
                EventType::ButtonPress(b) => {
                    if let Some(button) = map_button(b) {
                        let _ = tx.send(RawInput::Button {
                            button,
                            action: KeyAction::Press,
                        });
                    }
                }
                EventType::ButtonRelease(b) => {
                    if let Some(button) = map_button(b) {
                        let _ = tx.send(RawInput::Button {
                            button,
                            action: KeyAction::Release,
                        });
                    }
                }
                EventType::KeyPress(k) => {
                    let _ = tx.send(RawInput::Key {
                        code: key_to_code(&k),
                        action: KeyAction::Press,
                    });
                }
                EventType::KeyRelease(k) => {
                    let _ = tx.send(RawInput::Key {
                        code: key_to_code(&k),
                        action: KeyAction::Release,
                    });
                }
                EventType::Wheel { delta_x, delta_y } => {
                    let _ = tx.send(RawInput::Wheel {
                        dx: delta_x,
                        dy: delta_y,
                    });
                }
            };

            if let Err(e) = rdev::listen(callback) {
                on_error(format!("Global input listener failed: {e:?}"));
            }
        })
        .expect("failed to spawn input-listener thread");
}
