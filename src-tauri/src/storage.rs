//! Macro file persistence (SPEC §F7, §9). Human-readable, versioned `.json`.
//! Settings/recent-files live in tauri-plugin-store (handled in commands).

use std::fs;
use std::path::{Path, PathBuf};

use crate::model::{Macro, MacroMeta, Source, MACRO_VERSION};

#[derive(Debug, thiserror::Error)]
pub enum StorageError {
    #[error("file error: {0}")]
    Io(String),
    #[error("this macro was made with a newer version ({found}); update the app to open it")]
    NewerVersion { found: u32 },
    #[error("invalid macro file: {0}")]
    Parse(String),
}

pub type Result<T> = std::result::Result<T, StorageError>;

pub fn save_macro(path: &str, macro_: &Macro) -> Result<()> {
    let json =
        serde_json::to_string_pretty(macro_).map_err(|e| StorageError::Parse(e.to_string()))?;
    if let Some(parent) = Path::new(path).parent() {
        fs::create_dir_all(parent).map_err(|e| StorageError::Io(e.to_string()))?;
    }
    fs::write(path, json).map_err(|e| StorageError::Io(e.to_string()))
}

pub fn load_macro(path: &str) -> Result<Macro> {
    let text = fs::read_to_string(path).map_err(|e| StorageError::Io(e.to_string()))?;
    parse_macro(&text)
}

/// Parse + version-gate. Unknown future versions get a friendly error, not a crash.
pub fn parse_macro(text: &str) -> Result<Macro> {
    let value: serde_json::Value =
        serde_json::from_str(text).map_err(|e| StorageError::Parse(e.to_string()))?;
    let version = value.get("version").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
    if version > MACRO_VERSION {
        return Err(StorageError::NewerVersion { found: version });
    }
    serde_json::from_value(value).map_err(|e| StorageError::Parse(e.to_string()))
}

pub fn delete_macro(path: &str) -> Result<()> {
    fs::remove_file(path).map_err(|e| StorageError::Io(e.to_string()))
}

/// List all `.json` macros in a directory as lightweight metadata.
pub fn list_macros_in_dir(dir: &Path) -> Vec<MacroMeta> {
    let mut out = Vec::new();
    let Ok(entries) = fs::read_dir(dir) else {
        return out;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        if let Some(meta) = read_meta(&path) {
            out.push(meta);
        }
    }
    out.sort_by(|a, b| b.created.cmp(&a.created));
    out
}

fn read_meta(path: &PathBuf) -> Option<MacroMeta> {
    let text = fs::read_to_string(path).ok()?;
    let m: Macro = parse_macro(&text).ok()?;
    Some(MacroMeta {
        name: m.name,
        path: path.to_string_lossy().to_string(),
        source: m.source,
        event_count: m.events.len(),
        created: m.created,
    })
}

#[allow(dead_code)]
fn _source_hint(s: Source) -> &'static str {
    match s {
        Source::Recorded => "recorded",
        Source::Built => "built",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Event, EventKind, MacroSettings, MouseButton};

    fn sample() -> Macro {
        Macro {
            version: 1,
            name: "Roundtrip".into(),
            created: "2026-06-29T18:30:00Z".into(),
            source: Source::Built,
            settings: MacroSettings::default(),
            monitors: vec![],
            events: vec![
                Event {
                    t: 0,
                    kind: EventKind::Click {
                        button: MouseButton::Left,
                        x: 10,
                        y: 20,
                        count: 1,
                    },
                },
                Event {
                    t: 100,
                    kind: EventKind::Key {
                        code: "KeyE".into(),
                        action: crate::model::KeyAction::Press,
                    },
                },
            ],
        }
    }

    #[test]
    fn serialize_uses_spec_shape() {
        let m = sample();
        let json = serde_json::to_string(&m).unwrap();
        // EventKind is flattened + internally tagged on "kind".
        assert!(json.contains(r#""kind":"click""#));
        assert!(json.contains(r#""button":"left""#));
        assert!(json.contains(r#""t":0"#));
    }

    #[test]
    fn roundtrip_is_lossless() {
        let m = sample();
        let json = serde_json::to_string(&m).unwrap();
        let back = parse_macro(&json).unwrap();
        assert_eq!(m, back);
    }

    #[test]
    fn newer_version_is_friendly_error() {
        let json = r#"{"version":999,"name":"x","created":"now","source":"built","settings":{"repeat":1,"speed":1.0},"events":[]}"#;
        assert!(matches!(
            parse_macro(json),
            Err(StorageError::NewerVersion { found: 999 })
        ));
    }

    #[test]
    fn garbage_is_parse_error() {
        assert!(matches!(
            parse_macro("not json"),
            Err(StorageError::Parse(_))
        ));
    }

    #[test]
    fn file_save_load_roundtrip() {
        let mut path = std::env::temp_dir();
        path.push(format!("iac_test_macro_{}.json", std::process::id()));
        let p = path.to_string_lossy().to_string();
        save_macro(&p, &sample()).unwrap();
        let loaded = load_macro(&p).unwrap();
        assert_eq!(loaded, sample());
        let _ = delete_macro(&p);
    }
}
