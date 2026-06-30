//! Global hotkey matching (SPEC §F5). The listener consumer asks
//! `match_action` on each key press. Rebinding/persistence happens via settings.

use std::sync::Mutex;

use crate::ipc::events::HotkeyAction;
use crate::model::HotkeyConfig;

#[derive(Default)]
pub struct HotkeyManager {
    cfg: Mutex<HotkeyConfig>,
}

impl HotkeyManager {
    pub fn new(cfg: HotkeyConfig) -> Self {
        Self {
            cfg: Mutex::new(cfg),
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

    /// Which action this key code triggers (on press), if any.
    pub fn match_action(&self, code: &str) -> Option<HotkeyAction> {
        let c = self.cfg.lock().unwrap();
        if code == c.panic {
            Some(HotkeyAction::Panic)
        } else if code == c.record_toggle {
            Some(HotkeyAction::Record)
        } else if code == c.play_stop_toggle {
            Some(HotkeyAction::PlayStop)
        } else if code == c.capture_cursor {
            Some(HotkeyAction::Capture)
        } else {
            None
        }
    }
}

/// Detect duplicate bindings. Returns human-readable conflict messages (SPEC §F5).
pub fn conflicts(cfg: &HotkeyConfig) -> Vec<String> {
    let entries = [
        ("Record toggle", &cfg.record_toggle),
        ("Play/Stop toggle", &cfg.play_stop_toggle),
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
        assert_eq!(m.match_action("F5"), Some(HotkeyAction::Record));
        assert_eq!(m.match_action("F6"), Some(HotkeyAction::PlayStop));
        assert_eq!(m.match_action("F7"), Some(HotkeyAction::Capture));
        assert_eq!(m.match_action("F12"), Some(HotkeyAction::Panic));
        assert_eq!(m.match_action("KeyA"), None);
    }

    #[test]
    fn defaults_have_no_conflicts() {
        assert!(conflicts(&HotkeyConfig::default()).is_empty());
    }

    #[test]
    fn duplicate_binding_is_flagged() {
        let cfg = HotkeyConfig {
            record_toggle: "F8".into(),
            play_stop_toggle: "F8".into(),
            capture_cursor: "F6".into(),
            panic: "F12".into(),
        };
        assert_eq!(conflicts(&cfg).len(), 1);
    }
}
