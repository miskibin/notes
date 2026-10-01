use std::fs;
use std::path::PathBuf;
use std::time::UNIX_EPOCH;

use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct HistoryEntry {
    pub id: String,
    pub note: String,
    pub modified_ms: u64,
    pub deleted: bool,
}

#[derive(Debug, Serialize)]
pub struct NoteFile {
    pub name: String,
    pub title: String,
    pub modified_ms: u64,
    pub line_count: usize,
}

fn invalid_file_name(name: &str) -> bool {
    let stem = name.split('.').next().unwrap_or("").to_ascii_uppercase();
    name.is_empty()
        || name
            .chars()
            .any(|ch| ch.is_control() || "/\\:<>\"|?*".contains(ch))
        || name.ends_with(['.', ' '])
        || name.contains("..")
        || matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (stem.len() == 4
            && (stem.starts_with("COM") || stem.starts_with("LPT"))
            && matches!(stem.as_bytes()[3], b'1'..=b'9'))
}

pub fn note_file_name(name: &str) -> Result<String, String> {
    let name = name.trim();
    if invalid_file_name(name) || !name.to_ascii_lowercase().ends_with(".md") || name == ".md" {
        return Err("Invalid note name".into());
    }
    Ok(name.to_string())
}

fn asset_file_name(relative: &str) -> Result<String, String> {
    let relative = relative.trim().replace('\\', "/");
    let Some(name) = relative.strip_prefix("assets/") else {
        return Err("Not an asset path".into());
    };
    if invalid_file_name(name) {
        return Err("Invalid asset path".into());
    }
    Ok(name.to_string())
}

fn image_ext(ext: &str) -> Result<&'static str, String> {
    let ext = ext.trim().trim_start_matches('.').to_ascii_lowercase();
    match ext.as_str() {
        "png" => Ok("png"),
        "jpg" | "jpeg" => Ok("jpg"),
        "gif" => Ok("gif"),
        "webp" => Ok("webp"),
        "svg" => Ok("svg"),
        _ => Err("Unsupported image type".into()),
    }
}

fn open_vault(vault: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(vault.trim());
    if path.as_os_str().is_empty() {
        return Err("Choose a notes folder".into());
    }
    fs::create_dir_all(&path).map_err(|err| err.to_string())?;
    fs::create_dir_all(path.join("assets")).map_err(|err| err.to_string())?;
    path.canonicalize().map_err(|err| err.to_string())
}

fn markdown_title(head: &str, filename: &str) -> String {
    for line in head.lines() {
        let line = line.trim();
        let hashes = line.chars().take_while(|ch| *ch == '#').count();
        if (1..=6).contains(&hashes) && line.as_bytes().get(hashes) == Some(&b' ') {
            let title = line[hashes..].trim();
            if !title.is_empty() {
                return title.to_string();
            }
        }
    }
    filename.trim_end_matches(".md").to_string()
}

fn markdown_line_count(body: &str) -> usize {
    if body.is_empty() {
        return 0;
    }
    let normalized = body.replace("\r\n", "\n").replace('\r', "\n");
    normalized.split('\n').count() - usize::from(normalized.ends_with('\n'))
}

#[tauri::command]
pub fn default_vault_dir() -> Result<String, String> {
    let docs = dirs::document_dir()
        .or_else(dirs::home_dir)
        .ok_or_else(|| "Could not find a documents folder".to_string())?;
    let path = docs.join("Notes");
    fs::create_dir_all(path.join("assets")).map_err(|err| err.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn list_notes(vault: String) -> Result<Vec<NoteFile>, String> {
    let vault = open_vault(&vault)?;
    let mut notes = Vec::new();
    for entry in fs::read_dir(&vault).map_err(|err| err.to_string())? {
        let entry = entry.map_err(|err| err.to_string())?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if note_file_name(name).is_err() {
            continue;
        }
        let modified_ms = entry
            .metadata()
            .and_then(|meta| meta.modified())
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|duration| u64::try_from(duration.as_millis()).unwrap_or(u64::MAX))
            .unwrap_or(0);
        let bytes = fs::read(&path).map_err(|err| err.to_string())?;
        let body = String::from_utf8_lossy(&bytes);
        notes.push(NoteFile {
            title: markdown_title(&body, name),
            name: name.to_string(),
            modified_ms,
            line_count: markdown_line_count(&body),
        });
    }
    notes.sort_by(|a, b| {
        b.modified_ms
            .cmp(&a.modified_ms)
            .then(a.title.cmp(&b.title))
    });
    Ok(notes)
}

#[tauri::command]
pub fn read_note(vault: String, name: String) -> Result<String, String> {
    let vault = open_vault(&vault)?;
    let name = note_file_name(&name)?;
    let path = vault.join(name);
    if !path.is_file() {
        return Err("Note not found".into());
    }
    fs::read_to_string(path).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn write_note(vault: String, name: String, body: String) -> Result<(), String> {
    let vault = open_vault(&vault)?;
    let name = note_file_name(&name)?;
    let path = vault.join(&name);
    if path.is_file() {
        let previous = fs::read_to_string(&path).map_err(|err| err.to_string())?;
        if previous != body {
            archive_version(&vault, &name, &previous, false)?;
        }
    }
    let tmp = vault.join(format!(".{name}.writing"));
    fs::write(&tmp, body).map_err(|err| err.to_string())?;
    if fs::rename(&tmp, &path).is_ok() {
        return Ok(());
    }
    fs::copy(&tmp, &path).map_err(|err| err.to_string())?;
    let _ = fs::remove_file(&tmp);
    Ok(())
}

#[tauri::command]
pub fn delete_note(vault: String, name: String) -> Result<(), String> {
    let vault = open_vault(&vault)?;
    let name = note_file_name(&name)?;
    let path = vault.join(&name);
    if path.is_file() {
        let body = fs::read_to_string(&path).map_err(|err| err.to_string())?;
        archive_version(&vault, &name, &body, true)?;
        fs::remove_file(path).map_err(|err| err.to_string())?;
    }
    Ok(())
}

fn archive_version(
    vault: &std::path::Path,
    name: &str,
    body: &str,
    deleted: bool,
) -> Result<(), String> {
    let dir = vault.join(".notes-history");
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    let stamp = std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    let suffix = if deleted { "deleted" } else { "version" };
    fs::write(dir.join(format!("{stamp}-{suffix}-{name}")), body).map_err(|err| err.to_string())?;
    let mut entries: Vec<_> = fs::read_dir(&dir)
        .map_err(|err| err.to_string())?
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_file())
        .collect();
    entries.sort_by_key(|entry| entry.file_name());
    while entries.len() > 200 {
        let entry = entries.remove(0);
        let _ = fs::remove_file(entry.path());
    }
    Ok(())
}

#[tauri::command]
pub fn list_history(vault: String) -> Result<Vec<HistoryEntry>, String> {
    let vault = open_vault(&vault)?;
    let dir = vault.join(".notes-history");
    if !dir.is_dir() {
        return Ok(Vec::new());
    }
    let mut result = Vec::new();
    for entry in fs::read_dir(dir).map_err(|err| err.to_string())? {
        let entry = entry.map_err(|err| err.to_string())?;
        let id = entry.file_name().to_string_lossy().to_string();
        let Some((stamp, rest)) = id.split_once('-') else {
            continue;
        };
        let Some((kind, note)) = rest.split_once('-') else {
            continue;
        };
        if note_file_name(note).is_err() {
            continue;
        }
        result.push(HistoryEntry {
            id,
            note: note.into(),
            modified_ms: stamp.parse().unwrap_or(0),
            deleted: kind == "deleted",
        });
    }
    result.sort_by(|a, b| b.modified_ms.cmp(&a.modified_ms));
    Ok(result)
}

#[tauri::command]
pub fn read_history(vault: String, id: String) -> Result<String, String> {
    let vault = open_vault(&vault)?;
    if invalid_file_name(&id) {
        return Err("Invalid history entry".into());
    }
    fs::read_to_string(vault.join(".notes-history").join(id)).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn save_image(vault: String, data_base64: String, ext: String) -> Result<String, String> {
    let vault = open_vault(&vault)?;
    let ext = image_ext(&ext)?;
    let bytes = STANDARD
        .decode(data_base64.trim())
        .map_err(|_| "Image data is not valid base64".to_string())?;
    if bytes.is_empty() {
        return Err("Image is empty".into());
    }
    if bytes.len() > 15 * 1024 * 1024 {
        return Err("Image is larger than 15 MB".into());
    }
    let stamp = std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let name = format!("{stamp}-{}.{ext}", std::process::id());
    let path = vault.join("assets").join(&name);
    fs::write(&path, bytes).map_err(|err| err.to_string())?;
    Ok(format!("assets/{name}"))
}

#[tauri::command]
pub fn read_asset(vault: String, relative: String) -> Result<String, String> {
    let vault = open_vault(&vault)?;
    let name = asset_file_name(&relative)?;
    let path = vault.join("assets").join(name);
    if !path.is_file() {
        return Err("Image not found".into());
    }
    let bytes = fs::read(&path).map_err(|err| err.to_string())?;
    Ok(STANDARD.encode(bytes))
}

#[cfg(test)]
mod tests {
    use super::{asset_file_name, image_ext, markdown_line_count, markdown_title, note_file_name};

    #[test]
    fn line_count_handles_windows_and_trailing_newlines() {
        assert_eq!(markdown_line_count(""), 0);
        assert_eq!(markdown_line_count("one\n"), 1);
        assert_eq!(markdown_line_count("one\r\n\r\ntwo\r\n"), 3);
        assert_eq!(markdown_line_count("one\n\n"), 2);
        assert_eq!(markdown_line_count("one\rtwo"), 2);
    }

    #[test]
    fn note_names_stay_in_the_vault_root() {
        assert!(note_file_name("welcome.md").is_ok());
        assert!(note_file_name("../secret.md").is_err());
        assert!(note_file_name("nested/note.md").is_err());
        assert!(note_file_name("note.txt").is_err());
        assert!(note_file_name("note.md:payload.md").is_err());
        assert!(note_file_name("CON.md").is_err());
        assert!(note_file_name("LPT1.md").is_err());
        assert!(note_file_name("żółć.md").is_ok());
    }

    #[test]
    fn assets_cannot_escape() {
        assert_eq!(asset_file_name("assets/a.png").unwrap(), "a.png");
        assert!(asset_file_name("assets/../note.md").is_err());
        assert!(asset_file_name("note.md").is_err());
        assert!(asset_file_name("assets/a.png:stream").is_err());
    }

    #[test]
    fn image_extensions_are_limited() {
        assert_eq!(image_ext("JPEG").unwrap(), "jpg");
        assert!(image_ext("exe").is_err());
    }

    #[test]
    fn title_uses_the_first_heading() {
        assert_eq!(
            markdown_title("## Pasted heading\n\nbody", "untitled.md"),
            "Pasted heading"
        );
        assert_eq!(markdown_title("no heading", "untitled.md"), "untitled");
    }
}
