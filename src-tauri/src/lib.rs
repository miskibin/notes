mod ollama;
mod vault;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            vault::default_vault_dir,
            vault::list_notes,
            vault::read_note,
            vault::write_note,
            vault::delete_note,
            vault::save_image,
            vault::read_asset,
            ollama::list_models,
            ollama::complete_line,
            ollama::edit_selection,
            ollama::format_note,
            ollama::visualize_selection,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
