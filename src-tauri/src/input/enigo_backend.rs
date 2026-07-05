//! Fallback simulation backend using `enigo`. Selected when `rdev::simulate`
//! misbehaves on a platform (SPEC §3). On Windows enigo uses `SetCursorPos`
//! for absolute moves, which can be more reliable on scaled multi-monitor setups.

use std::sync::Mutex;

use enigo::{
    Axis, Button as EButton, Coordinate, Direction, Enigo, Key as EKey, Keyboard, Mouse, Settings,
};

use super::backend::{InputBackend, InputError, Result};
use crate::model::{KeyAction, MouseButton};

pub struct EnigoBackend {
    inner: Mutex<SendEnigo>,
}

/// enigo's macOS `Enigo` holds a `CGEventSource` (a `NonNull`, so not `Send`),
/// which makes `Mutex<Enigo>` not `Sync` and blocks `InputBackend: Send + Sync`.
/// `EnigoBackend` only ever touches the inner `Enigo` while holding its `Mutex`,
/// so access is serialized to one thread at a time - assert `Send` on a newtype
/// and deref to the wrapped `Enigo` so the method bodies stay unchanged.
struct SendEnigo(Enigo);

// SAFETY: the inner `Enigo` is reached only through `EnigoBackend::inner`'s
// `Mutex`, i.e. never used concurrently from two threads.
unsafe impl Send for SendEnigo {}

impl std::ops::Deref for SendEnigo {
    type Target = Enigo;
    fn deref(&self) -> &Enigo {
        &self.0
    }
}

impl std::ops::DerefMut for SendEnigo {
    fn deref_mut(&mut self) -> &mut Enigo {
        &mut self.0
    }
}

impl EnigoBackend {
    pub fn new() -> Result<Self> {
        let enigo =
            Enigo::new(&Settings::default()).map_err(|e| InputError::Init(format!("{e:?}")))?;
        Ok(Self {
            inner: Mutex::new(SendEnigo(enigo)),
        })
    }
}

fn map_button(b: MouseButton) -> EButton {
    match b {
        MouseButton::Left => EButton::Left,
        MouseButton::Right => EButton::Right,
        MouseButton::Middle => EButton::Middle,
    }
}

fn map_dir(a: KeyAction) -> Direction {
    match a {
        KeyAction::Press => Direction::Press,
        KeyAction::Release => Direction::Release,
    }
}

/// Best-effort map from our platform-neutral codes to enigo keys.
fn map_key(code: &str) -> Option<EKey> {
    // Letters: KeyA..KeyZ → lowercase unicode.
    if let Some(rest) = code.strip_prefix("Key") {
        if rest.len() == 1 {
            let c = rest.chars().next().unwrap().to_ascii_lowercase();
            if c.is_ascii_alphabetic() {
                return Some(EKey::Unicode(c));
            }
        }
    }
    // Top-row digits Num0..Num9 and keypad Kp0..Kp9 → unicode digit.
    for (prefix, _) in [("Num", ()), ("Kp", ())] {
        if let Some(rest) = code.strip_prefix(prefix) {
            if rest.len() == 1 {
                if let Some(c) = rest.chars().next() {
                    if c.is_ascii_digit() {
                        return Some(EKey::Unicode(c));
                    }
                }
            }
        }
    }
    let k = match code {
        "Return" | "KpReturn" => EKey::Return,
        "Tab" => EKey::Tab,
        "Space" => EKey::Space,
        "Backspace" => EKey::Backspace,
        "Delete" | "KpDelete" => EKey::Delete,
        "Escape" => EKey::Escape,
        "UpArrow" => EKey::UpArrow,
        "DownArrow" => EKey::DownArrow,
        "LeftArrow" => EKey::LeftArrow,
        "RightArrow" => EKey::RightArrow,
        "Home" => EKey::Home,
        "End" => EKey::End,
        "PageUp" => EKey::PageUp,
        "PageDown" => EKey::PageDown,
        "CapsLock" => EKey::CapsLock,
        "ShiftLeft" | "ShiftRight" => EKey::Shift,
        "ControlLeft" | "ControlRight" => EKey::Control,
        "Alt" | "AltGr" => EKey::Alt,
        "MetaLeft" | "MetaRight" => EKey::Meta,
        "F1" => EKey::F1,
        "F2" => EKey::F2,
        "F3" => EKey::F3,
        "F4" => EKey::F4,
        "F5" => EKey::F5,
        "F6" => EKey::F6,
        "F7" => EKey::F7,
        "F8" => EKey::F8,
        "F9" => EKey::F9,
        "F10" => EKey::F10,
        "F11" => EKey::F11,
        "F12" => EKey::F12,
        "Minus" => EKey::Unicode('-'),
        "Equal" => EKey::Unicode('='),
        "Comma" => EKey::Unicode(','),
        "Dot" => EKey::Unicode('.'),
        "Slash" => EKey::Unicode('/'),
        "SemiColon" => EKey::Unicode(';'),
        "Quote" => EKey::Unicode('\''),
        "LeftBracket" => EKey::Unicode('['),
        "RightBracket" => EKey::Unicode(']'),
        "BackSlash" => EKey::Unicode('\\'),
        "BackQuote" => EKey::Unicode('`'),
        _ => return None,
    };
    Some(k)
}

impl InputBackend for EnigoBackend {
    fn move_to(&self, x: i32, y: i32) -> Result<()> {
        let mut enigo = self.inner.lock().unwrap();
        enigo
            .move_mouse(x, y, Coordinate::Abs)
            .map_err(|e| InputError::Simulate(format!("{e:?}")))
    }

    fn button(&self, button: MouseButton, action: KeyAction) -> Result<()> {
        let mut enigo = self.inner.lock().unwrap();
        enigo
            .button(map_button(button), map_dir(action))
            .map_err(|e| InputError::Simulate(format!("{e:?}")))
    }

    fn key(&self, code: &str, action: KeyAction) -> Result<()> {
        let key = map_key(code).ok_or_else(|| InputError::UnsupportedKey(code.to_string()))?;
        let mut enigo = self.inner.lock().unwrap();
        enigo
            .key(key, map_dir(action))
            .map_err(|e| InputError::Simulate(format!("{e:?}")))
    }

    fn scroll(&self, dx: i32, dy: i32) -> Result<()> {
        let mut enigo = self.inner.lock().unwrap();
        // enigo positive length scrolls down/right; our dy>0 means up.
        if dy != 0 {
            enigo
                .scroll(-dy, Axis::Vertical)
                .map_err(|e| InputError::Simulate(format!("{e:?}")))?;
        }
        if dx != 0 {
            enigo
                .scroll(dx, Axis::Horizontal)
                .map_err(|e| InputError::Simulate(format!("{e:?}")))?;
        }
        Ok(())
    }

    fn name(&self) -> &'static str {
        "enigo"
    }
}
