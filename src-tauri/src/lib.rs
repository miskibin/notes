mod ollama;
mod vault;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(ollama::ChartRequests::default())
        .manage(ollama::CompletionRequests::default())
        .manage(ollama::FormatRequests::default())
        .invoke_handler(tauri::generate_handler![
            vault::default_vault_dir,
            vault::list_notes,
            vault::read_note,
            vault::write_note,
            vault::delete_note,
            vault::list_history,
            vault::read_history,
            vault::save_image,
            vault::read_asset,
            ollama::list_models,
            ollama::complete_line,
            ollama::cancel_completion,
            ollama::edit_selection,
            ollama::format_note,
            ollama::system_one,
            ollama::cancel_format_request,
            ollama::visualize_selection,
            ollama::cancel_visualize,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
