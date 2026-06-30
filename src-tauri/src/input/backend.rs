//! The `InputBackend` trait: simulation (move / button / key). Global *listening*
//! is rdev-only and lives in `input/listener.rs`; the trait covers *synthesis*
//! so a platform can swap rdev → enigo behind it without touching the engine
//! (SPEC §3, §4).

use crate::model::{KeyAction, MouseButton};

#[derive(Debug, thiserror::Error)]
pub enum InputError {
    #[error("input simulation failed: {0}")]
    Simulate(String),
    #[error("backend init failed: {0}")]
    Init(String),
    #[error("unsupported key code: {0}")]
    UnsupportedKey(String),
}

pub type Result<T> = std::result::Result<T, InputError>;

pub trait InputBackend: Send + Sync {
    /// Move the cursor to a global virtual-desktop physical pixel.
    fn move_to(&self, x: i32, y: i32) -> Result<()>;
    /// Press or release a mouse button at the current cursor position.
    fn button(&self, button: MouseButton, action: KeyAction) -> Result<()>;
    /// Press or release a key by platform-neutral code (e.g. "KeyE", "Return").
    fn key(&self, code: &str, action: KeyAction) -> Result<()>;
    /// Backend name for diagnostics ("rdev" | "enigo").
    fn name(&self) -> &'static str;
}
