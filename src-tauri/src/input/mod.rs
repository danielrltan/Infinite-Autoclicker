pub mod backend;
pub mod coords;
pub mod cursor;
pub mod enigo_backend;
pub mod key_codes;
pub mod listener;
pub mod permissions;
pub mod rdev_backend;

use std::sync::Arc;

use backend::InputBackend;
use enigo_backend::EnigoBackend;
use rdev_backend::RdevBackend;

/// Build the simulation backend. Defaults to rdev (SPEC §3 primary); set
/// `IAC_BACKEND=enigo` to use the enigo fallback (e.g. if rdev's simulate path
/// misbehaves on a given platform / multi-monitor scaled setup).
pub fn make_backend() -> Arc<dyn InputBackend> {
    let choice = std::env::var("IAC_BACKEND").unwrap_or_default();
    if choice.eq_ignore_ascii_case("enigo") {
        match EnigoBackend::new() {
            Ok(b) => return Arc::new(b),
            Err(e) => eprintln!("enigo backend init failed ({e}); falling back to rdev"),
        }
    }
    Arc::new(RdevBackend::new())
}
