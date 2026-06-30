//! Macro file persistence (SPEC §F7, §9). Human-readable, versioned `.json`.
//! Settings/recent-files live in tauri-plugin-store (handled in commands).

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::model::{Macro, MacroMeta, Source, MACRO_VERSION};

#[derive(Debug, thiserror::Error)]
pub enum StorageError {
    #[error("file error: {0}")]
    Io(String),
    #[error("this macro was made with a newer version ({found}); update the app to open it")]
    NewerVersion { found: u32 },
    #[error("invalid macro file: {0}")]
    Parse(String),
    /// Overwrite guard: target exists and overwrite was not requested. `Display`
    /// is exactly `EXISTS:<path>` so the UI can detect it and offer to replace.
    #[error("EXISTS:{path}")]
    Exists { path: String },
}

pub type Result<T> = std::result::Result<T, StorageError>;

/// One soft-deleted macro under `<macros_dir>/.trash/`. `token` is the on-disk
/// data filename and the stable id for restore/purge; a `<token>.trashmeta`
/// sidecar stores this struct. Doubles as the IPC payload.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrashEntry {
    pub token: String,
    pub original_name: String,
    pub original_path: String,
    pub trashed_at: String,
    pub event_count: usize,
}

/// Normalize mixed separators to the platform's. On Windows
/// `C:\a\b/c.json` -> `C:\a\b\c.json`. Fixes paths concatenated in the frontend.
pub fn normalize_path(input: &str) -> PathBuf {
    let unified = if std::path::MAIN_SEPARATOR == '\\' {
        input.replace('/', "\\")
    } else {
        input.replace('\\', "/")
    };
    PathBuf::from(unified)
}

/// Crash-safe write: serialize -> temp file in the SAME dir -> fsync -> rename
/// over the target. A crash leaves at most a stray dotfile, never a half-written
/// or empty macro. `fs::rename` replaces the destination on Windows and Unix.
pub fn save_macro_atomic(path: &Path, macro_: &Macro) -> Result<()> {
    let json =
        serde_json::to_string_pretty(macro_).map_err(|e| StorageError::Parse(e.to_string()))?;
    let parent = path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .ok_or_else(|| StorageError::Io("destination has no parent directory".into()))?;
    fs::create_dir_all(parent).map_err(|e| StorageError::Io(e.to_string()))?;

    let stem = path.file_name().and_then(|s| s.to_str()).unwrap_or("macro");
    // Leading '.' => skipped by list_macros_in_dir.
    let tmp = parent.join(format!(
        ".{}.{}.{}.tmp",
        stem,
        std::process::id(),
        crate::util::now_ms()
    ));
    {
        use std::io::Write;
        let mut f = fs::File::create(&tmp).map_err(|e| StorageError::Io(e.to_string()))?;
        f.write_all(json.as_bytes())
            .map_err(|e| StorageError::Io(e.to_string()))?;
        f.sync_all().map_err(|e| StorageError::Io(e.to_string()))?;
    }
    if let Err(e) = fs::rename(&tmp, path) {
        let _ = fs::remove_file(&tmp);
        return Err(StorageError::Io(e.to_string()));
    }
    Ok(())
}

/// Back-compat wrapper (tests / internal callers): normalize + atomic.
pub fn save_macro(path: &str, macro_: &Macro) -> Result<()> {
    save_macro_atomic(&normalize_path(path), macro_)
}

/// True if a macro file already exists at the (normalized) path.
pub fn macro_exists(path: &str) -> bool {
    normalize_path(path).is_file()
}

/// Overwrite-guarded save. Existing file + `overwrite == false` => `Exists`.
/// When overwriting, the prior version is first snapshotted into `.trash`
/// (fail-closed: a backup failure aborts the save) before the atomic write.
pub fn save_macro_guarded(path: &str, macro_: &Macro, overwrite: bool) -> Result<PathBuf> {
    let dest = normalize_path(path);
    if dest.is_file() {
        if !overwrite {
            return Err(StorageError::Exists {
                path: dest.to_string_lossy().into_owned(),
            });
        }
        trash_put(&dest, TrashMode::Copy)?; // undoable backup before clobber
    }
    save_macro_atomic(&dest, macro_)?;
    Ok(dest)
}

/// Build `<macros_dir>/<sanitized-name>.json` in Rust so the frontend never
/// concatenates paths.
pub fn canonical_macro_path(macros_dir: &Path, name: &str) -> PathBuf {
    macros_dir.join(format!("{}.json", sanitize_macro_name(name)))
}

/// Make a user-supplied name safe as a single filename stem.
pub fn sanitize_macro_name(name: &str) -> String {
    let base = name.rsplit(['/', '\\']).next().unwrap_or(name);
    let stem = if base.to_ascii_lowercase().ends_with(".json") {
        &base[..base.len() - 5]
    } else {
        base
    };
    let mut out: String = stem
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            c if (c as u32) < 0x20 => '_',
            c => c,
        })
        .collect();
    out = out.trim_matches(|c: char| c == ' ' || c == '.').to_string();
    if out.len() > 120 {
        out.truncate(120);
        out = out.trim_end().to_string();
    }
    if out.is_empty() {
        out = "Untitled_macro".to_string();
    }
    const RESERVED: [&str; 22] = [
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
        "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ];
    if RESERVED.iter().any(|r| r.eq_ignore_ascii_case(&out)) {
        out = format!("_{}", out);
    }
    out
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
        // Skip the .trash subdir and any hidden/temp dotfiles (atomic writes use
        // ".<name>.<pid>.<ms>.tmp").
        if path.is_dir() {
            continue;
        }
        if path
            .file_name()
            .and_then(|n| n.to_str())
            .is_some_and(|n| n.starts_with('.'))
        {
            continue;
        }
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

// ── Trash: soft delete, list, restore, purge (SPEC §F7 + owner request) ──────

enum TrashMode {
    Move, // soft delete: relocate the file
    Copy, // overwrite backup: leave the original in place
}

fn trash_dir_for(file: &Path) -> Result<PathBuf> {
    let parent = file
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .ok_or_else(|| StorageError::Io("file has no parent directory".into()))?;
    Ok(parent.join(".trash"))
}

/// Rename with a cross-volume copy+remove fallback (insurance; `.trash` shares
/// the macros volume).
fn move_path(from: &Path, to: &Path) -> Result<()> {
    if fs::rename(from, to).is_ok() {
        return Ok(());
    }
    fs::copy(from, to).map_err(|e| StorageError::Io(e.to_string()))?;
    fs::remove_file(from).map_err(|e| StorageError::Io(e.to_string()))?;
    Ok(())
}

fn trash_put(file: &Path, mode: TrashMode) -> Result<TrashEntry> {
    let trash = trash_dir_for(file)?;
    fs::create_dir_all(&trash).map_err(|e| StorageError::Io(e.to_string()))?;

    let original_name = file
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("macro.json")
        .to_string();
    let event_count = load_macro(&file.to_string_lossy())
        .map(|m| m.events.len())
        .unwrap_or(0);

    let now = crate::util::now_ms();
    // Collision-proof token: "<ms>-<seq>-<name>.json"; bump seq until free.
    let (token, data_path, meta_path) = {
        let mut seq = 0u32;
        loop {
            let token = format!(
                "{}-{}-{}.json",
                now,
                seq,
                sanitize_macro_name(&original_name)
            );
            let data = trash.join(&token);
            let meta = trash.join(format!("{}.trashmeta", token));
            if !data.exists() && !meta.exists() {
                break (token, data, meta);
            }
            seq += 1;
        }
    };

    match mode {
        TrashMode::Move => move_path(file, &data_path)?,
        TrashMode::Copy => {
            fs::copy(file, &data_path).map_err(|e| StorageError::Io(e.to_string()))?;
        }
    }

    let entry = TrashEntry {
        token,
        original_name,
        original_path: file.to_string_lossy().into_owned(),
        trashed_at: crate::util::now_iso8601(),
        event_count,
    };
    let meta_json =
        serde_json::to_string_pretty(&entry).map_err(|e| StorageError::Parse(e.to_string()))?;
    fs::write(&meta_path, meta_json).map_err(|e| StorageError::Io(e.to_string()))?;
    Ok(entry)
}

/// Soft delete: move the macro into its dir's `.trash/`.
pub fn soft_delete_macro(path: &str) -> Result<TrashEntry> {
    let file = normalize_path(path);
    if !file.is_file() {
        return Err(StorageError::Io(format!(
            "no such macro: {}",
            file.display()
        )));
    }
    trash_put(&file, TrashMode::Move)
}

/// All trash entries under `<macros_dir>/.trash/`, newest first.
pub fn list_trash(macros_dir: &Path) -> Vec<TrashEntry> {
    let trash = macros_dir.join(".trash");
    let mut out = Vec::new();
    let Ok(entries) = fs::read_dir(&trash) else {
        return out;
    };
    for entry in entries.flatten() {
        let p = entry.path();
        if p.extension().and_then(|e| e.to_str()) != Some("trashmeta") {
            continue;
        }
        if let Ok(text) = fs::read_to_string(&p) {
            if let Ok(te) = serde_json::from_str::<TrashEntry>(&text) {
                out.push(te);
            }
        }
    }
    out.sort_by(|a, b| b.trashed_at.cmp(&a.trashed_at).then(b.token.cmp(&a.token)));
    out
}

/// Restore a trashed macro to its original location, or to `<stem> (restored)`
/// if that path is now taken. Never overwrites. Returns the path written.
pub fn restore_trash(macros_dir: &Path, token: &str) -> Result<PathBuf> {
    let trash = macros_dir.join(".trash");
    let data_path = trash.join(token);
    let meta_path = trash.join(format!("{}.trashmeta", token));
    if !data_path.is_file() {
        return Err(StorageError::Io(format!("trash item not found: {}", token)));
    }
    let text = fs::read_to_string(&meta_path).map_err(|e| StorageError::Io(e.to_string()))?;
    let entry: TrashEntry =
        serde_json::from_str(&text).map_err(|e| StorageError::Parse(e.to_string()))?;

    let original = normalize_path(&entry.original_path);
    let dir = original
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .map(Path::to_path_buf)
        .unwrap_or_else(|| macros_dir.to_path_buf());
    fs::create_dir_all(&dir).map_err(|e| StorageError::Io(e.to_string()))?;

    let dest = if original.exists() {
        unique_dest(&dir, &entry.original_name)
    } else {
        original
    };
    move_path(&data_path, &dest)?;
    let _ = fs::remove_file(&meta_path);
    Ok(dest)
}

fn unique_dest(dir: &Path, file_name: &str) -> PathBuf {
    let first = dir.join(file_name);
    if !first.exists() {
        return first;
    }
    let p = Path::new(file_name);
    let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("macro");
    let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("json");
    let mut candidate = dir.join(format!("{} (restored).{}", stem, ext));
    let mut n = 2;
    while candidate.exists() {
        candidate = dir.join(format!("{} (restored {}).{}", stem, n, ext));
        n += 1;
    }
    candidate
}

/// Permanently delete one trash entry (data file + sidecar).
pub fn purge_trash(macros_dir: &Path, token: &str) -> Result<()> {
    let trash = macros_dir.join(".trash");
    let mut last_err = None;
    for p in [
        trash.join(token),
        trash.join(format!("{}.trashmeta", token)),
    ] {
        if p.exists() {
            if let Err(e) = fs::remove_file(&p) {
                last_err = Some(e.to_string());
            }
        }
    }
    match last_err {
        Some(e) => Err(StorageError::Io(e)),
        None => Ok(()),
    }
}

/// Best-effort startup cleanup: purge trash older than `max_age_days`. Age comes
/// from the ms prefix baked into each token. Returns the count purged.
pub fn auto_purge_trash(macros_dir: &Path, max_age_days: u64) -> usize {
    let cutoff = crate::util::now_ms() - (max_age_days as i64) * 86_400_000;
    let mut purged = 0;
    for entry in list_trash(macros_dir) {
        let ms = entry
            .token
            .split('-')
            .next()
            .and_then(|s| s.parse::<i64>().ok());
        let too_old = ms.map(|ms| ms < cutoff).unwrap_or(false);
        if too_old && purge_trash(macros_dir, &entry.token).is_ok() {
            purged += 1;
        }
    }
    purged
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

    // A unique temp dir per test so they don't collide.
    fn tmp_dir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!(
            "iac_test_{}_{}_{}",
            tag,
            std::process::id(),
            crate::util::now_ms()
        ));
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn sanitize_rejects_dangerous_names() {
        assert_eq!(sanitize_macro_name("../../evil"), "evil");
        assert_eq!(sanitize_macro_name("a:b?c*"), "a_b_c_");
        assert_eq!(sanitize_macro_name("  "), "Untitled_macro");
        assert_eq!(sanitize_macro_name("trailing. "), "trailing");
        assert_eq!(sanitize_macro_name("con"), "_con"); // reserved (any case)
        assert_eq!(sanitize_macro_name("My Macro.json"), "My Macro"); // drops .json
    }

    #[test]
    fn normalize_handles_mixed_separators() {
        let p = normalize_path("a/b\\c.json");
        let s = p.to_string_lossy();
        assert!(!s.contains(if std::path::MAIN_SEPARATOR == '\\' {
            '/'
        } else {
            '\\'
        }));
    }

    #[test]
    fn overwrite_guard_blocks_then_backs_up() {
        let dir = tmp_dir("guard");
        let path = canonical_macro_path(&dir, "Loop");
        let p = path.to_string_lossy().to_string();
        // First save: fine.
        save_macro_guarded(&p, &sample(), false).unwrap();
        // Second save without overwrite: EXISTS.
        assert!(matches!(
            save_macro_guarded(&p, &sample(), false),
            Err(StorageError::Exists { .. })
        ));
        // With overwrite: prior version snapshotted to trash.
        save_macro_guarded(&p, &sample(), true).unwrap();
        assert_eq!(list_trash(&dir).len(), 1);
        assert!(list_macros_in_dir(&dir)
            .iter()
            .all(|m| m.name == "Roundtrip"));
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn soft_delete_list_restore_roundtrip() {
        let dir = tmp_dir("trash");
        let path = canonical_macro_path(&dir, "Gold farm");
        let p = path.to_string_lossy().to_string();
        save_macro(&p, &sample()).unwrap();

        let entry = soft_delete_macro(&p).unwrap();
        assert!(!path.exists()); // moved out of the library
        assert!(list_macros_in_dir(&dir).is_empty()); // .trash excluded
        assert_eq!(list_trash(&dir).len(), 1);

        let restored = restore_trash(&dir, &entry.token).unwrap();
        assert_eq!(restored, path); // back to original (nothing in the way)
        assert!(list_trash(&dir).is_empty());
        assert_eq!(list_macros_in_dir(&dir).len(), 1);
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn restore_never_overwrites_a_recreated_file() {
        let dir = tmp_dir("restore_collide");
        let path = canonical_macro_path(&dir, "Login");
        let p = path.to_string_lossy().to_string();
        save_macro(&p, &sample()).unwrap();
        let entry = soft_delete_macro(&p).unwrap();
        // Recreate a NEW macro at the same name before restoring.
        save_macro(&p, &sample()).unwrap();

        let restored = restore_trash(&dir, &entry.token).unwrap();
        assert_ne!(restored, path); // landed under "(restored)"
        assert!(restored.to_string_lossy().contains("(restored)"));
        assert!(path.exists()); // the recreated file is untouched
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn atomic_save_leaves_no_temp_files() {
        let dir = tmp_dir("atomic");
        let path = canonical_macro_path(&dir, "Clean");
        save_macro_atomic(&path, &sample()).unwrap();
        let leftovers: Vec<_> = fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .filter(|e| e.path().extension().and_then(|x| x.to_str()) == Some("tmp"))
            .collect();
        assert!(leftovers.is_empty());
        fs::remove_dir_all(&dir).ok();
    }
}
