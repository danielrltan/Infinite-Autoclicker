//! Primary simulation backend using `rdev::simulate` (SPEC §3).

use rdev::{simulate, Button, EventType};

use super::backend::{InputBackend, InputError, Result};
use super::key_codes::code_to_key;
use crate::model::{KeyAction, MouseButton};

pub struct RdevBackend;

impl RdevBackend {
    pub fn new() -> Self {
        Self
    }
}

impl Default for RdevBackend {
    fn default() -> Self {
        Self::new()
    }
}

fn map_button(b: MouseButton) -> Button {
    match b {
        MouseButton::Left => Button::Left,
        MouseButton::Right => Button::Right,
        MouseButton::Middle => Button::Middle,
    }
}

fn send(ev: &EventType) -> Result<()> {
    simulate(ev).map_err(|e| InputError::Simulate(format!("{e:?}")))
}

impl InputBackend for RdevBackend {
    fn move_to(&self, x: i32, y: i32) -> Result<()> {
        send(&EventType::MouseMove {
            x: x as f64,
            y: y as f64,
        })
    }

    fn button(&self, button: MouseButton, action: KeyAction) -> Result<()> {
        let b = map_button(button);
        match action {
            KeyAction::Press => send(&EventType::ButtonPress(b)),
            KeyAction::Release => send(&EventType::ButtonRelease(b)),
        }
    }

    fn key(&self, code: &str, action: KeyAction) -> Result<()> {
        let key = code_to_key(code).ok_or_else(|| InputError::UnsupportedKey(code.to_string()))?;
        match action {
            KeyAction::Press => send(&EventType::KeyPress(key)),
            KeyAction::Release => send(&EventType::KeyRelease(key)),
        }
    }

    fn scroll(&self, dx: i32, dy: i32) -> Result<()> {
        send(&EventType::Wheel {
            delta_x: dx as i64,
            delta_y: dy as i64,
        })
    }

    fn name(&self) -> &'static str {
        "rdev"
    }
}
