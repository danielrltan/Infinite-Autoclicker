//! Global hotkey matching (SPEC §F5). The listener consumer asks
//! `on_press`/`on_release` for each key edge. Rebinding/persistence happens via
//! settings.

use std::collections::HashSet;
use std::sync::Mutex;

use crate::ipc::events::HotkeyAction;
use crate::model::HotkeyConfig;

#[derive(Default)]
pub struct HotkeyManager {
    cfg: Mutex<HotkeyConfig>,
    /// Hotkey codes currently held down. Used to suppress OS keyboard
    /// auto-repeat for toggle actions (see `on_press`).
    held: Mutex<HashSet<String>>,
}

impl HotkeyManager {
    pub fn new(cfg: HotkeyConfig) -> Self {
        Self {
            cfg: Mutex::new(cfg),
            held: Mutex::new(HashSet::new()),
        }
    }

    pub fn get(&self) -> HotkeyConfig {
        self.cfg.lock().unwrap().clone()
    }

    pub fn set(&self, cfg: HotkeyConfig) {
        *self.cfg.lock().unwrap() = cfg;
    }

    pub fn codes(&self) -> Vec<String> {
        let c = self.cfg.lock().unwrap();
        c.codes().iter().map(|s| s.to_string()).collect()
    }

    /// Which action this key code triggers, if any (ignores held/repeat state).
    pub fn match_action(&self, code: &str) -> Option<HotkeyAction> {
        let c = self.cfg.lock().unwrap();
        if code == c.panic {
            Some(HotkeyAction::Panic)
        } else if code == c.record_toggle {
            Some(HotkeyAction::Record)
        } else if code == c.play_stop_toggle {
            Some(HotkeyAction::PlayStop)
        } else if code == c.autoclick_toggle {
            Some(HotkeyAction::AutoclickToggle)
        } else if code == c.capture_cursor {
            Some(HotkeyAction::Capture)
        } else {
            None
        }
    }

    /// Resolve a key-*press* to its action, applying auto-repeat suppression.
    ///
    /// The OS emits repeated `KeyPress` events while a key is held. For the
    /// *toggle* hotkeys (Record, Play/Stop) that flips the app between two
    /// states on every event, so a press held even briefly used to toggle
    /// on→off→on…, making F5/F6 feel like they "randomly don't work". We now
    /// fire a toggle only on the leading edge (first press after a release) and
    /// swallow repeats until `on_release`.
    ///
    /// Panic is deliberately *not* debounced: it's idempotent (stopping an
    /// already-stopped run is a no-op) and is the emergency kill switch, so it
    /// must fire on every press - never suppressed by held state. Capture is
    /// harmless to repeat as well.
    pub fn on_press(&self, code: &str) -> Option<HotkeyAction> {
        let action = self.match_action(code)?;
        if !matches!(
            action,
            HotkeyAction::Record | HotkeyAction::PlayStop | HotkeyAction::AutoclickToggle
        ) {
            return Some(action);
        }
        let mut held = self.held.lock().unwrap();
        if !held.insert(code.to_string()) {
            return None; // already held → OS auto-repeat, ignore
        }
        Some(action)
    }

    /// Clear the held state for a key so its next press is a fresh leading edge.
    pub fn on_release(&self, code: &str) {
        self.held.lock().unwrap().remove(code);
    }
}

/// Detect duplicate bindings. Returns human-readable conflict messages (SPEC §F5).
pub fn conflicts(cfg: &HotkeyConfig) -> Vec<String> {
    let entries = [
        ("Record toggle", &cfg.record_toggle),
        ("Play/Stop toggle", &cfg.play_stop_toggle),
        ("Auto-click toggle", &cfg.autoclick_toggle),
        ("Capture cursor", &cfg.capture_cursor),
        ("Panic", &cfg.panic),
    ];
    let mut out = Vec::new();
    for i in 0..entries.len() {
        for j in (i + 1)..entries.len() {
            if entries[i].1 == entries[j].1 {
                out.push(format!(
                    "{} and {} are both bound to {}",
                    entries[i].0, entries[j].0, entries[i].1
                ));
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_hotkeys_match_actions() {
        let m = HotkeyManager::new(HotkeyConfig::default());
        assert_eq!(m.match_action("F4"), Some(HotkeyAction::Record));
        assert_eq!(m.match_action("F5"), Some(HotkeyAction::PlayStop));
        assert_eq!(m.match_action("F6"), Some(HotkeyAction::AutoclickToggle));
        assert_eq!(m.match_action("F7"), Some(HotkeyAction::Capture));
        assert_eq!(m.match_action("F12"), Some(HotkeyAction::Panic));
        assert_eq!(m.match_action("KeyA"), None);
    }

    #[test]
    fn defaults_have_no_conflicts() {
        assert!(conflicts(&HotkeyConfig::default()).is_empty());
    }

    #[test]
    fn toggle_press_is_debounced_until_release() {
        let m = HotkeyManager::new(HotkeyConfig::default()); // F5 = Play/Stop
        // Leading edge fires.
        assert_eq!(m.on_press("F5"), Some(HotkeyAction::PlayStop));
        // OS auto-repeat while still held is swallowed (this was the bug: the
        // repeat toggled play back off, so nothing appeared to happen).
        assert_eq!(m.on_press("F5"), None);
        assert_eq!(m.on_press("F5"), None);
        // After release, the next press is a fresh edge again.
        m.on_release("F5");
        assert_eq!(m.on_press("F5"), Some(HotkeyAction::PlayStop));
    }

    #[test]
    fn panic_fires_on_every_press() {
        let m = HotkeyManager::new(HotkeyConfig::default()); // F12 = Panic
        // Panic must never be suppressed by held state - repeats are harmless
        // (idempotent) and it's the emergency stop.
        assert_eq!(m.on_press("F12"), Some(HotkeyAction::Panic));
        assert_eq!(m.on_press("F12"), Some(HotkeyAction::Panic));
    }

    #[test]
    fn duplicate_binding_is_flagged() {
        let cfg = HotkeyConfig {
            record_toggle: "F8".into(),
            play_stop_toggle: "F8".into(),
            autoclick_toggle: "F9".into(),
            capture_cursor: "F6".into(),
            panic: "F12".into(),
        };
        assert_eq!(conflicts(&cfg).len(), 1);
    }
}
