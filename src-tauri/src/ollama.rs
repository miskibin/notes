use std::time::Duration;

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
pub struct Completion {
    pub text: String,
    pub truncated: bool,
}

#[derive(Debug, Deserialize)]
struct TagsResponse {
    models: Option<Vec<TagModel>>,
}

#[derive(Debug, Deserialize)]
struct TagModel {
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GenerateResponse {
    response: Option<String>,
    done_reason: Option<String>,
    error: Option<String>,
}

fn normalize_host(host: &str) -> Result<String, String> {
    let host = host.trim().trim_end_matches('/');
    if host.is_empty() || host.chars().any(|ch| ch.is_whitespace()) {
        return Err("Invalid Ollama address".into());
    }
    if !(host.starts_with("http://") || host.starts_with("https://")) {
        return Err("Ollama address must start with http:// or https://".into());
    }
    Ok(host.to_string())
}

fn normalize_model(model: &str) -> Result<String, String> {
    let model = model.trim();
    if model.is_empty() || model.len() > 128 {
        return Err("Pick a model".into());
    }
    if !model
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, ':' | '.' | '_' | '-' | '/'))
    {
        return Err("Invalid model name".into());
    }
    Ok(model.to_string())
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("notes-app")
        .build()
        .map_err(|err| format!("HTTP client failed: {err}"))
}

fn map_err(err: reqwest::Error) -> String {
    if err.is_connect() || err.is_timeout() {
        "Ollama is not running at that address.".into()
    } else {
        format!("Ollama request failed: {err}")
    }
}

#[tauri::command]
pub async fn list_models(host: String) -> Result<Vec<String>, String> {
    let host = normalize_host(&host)?;
    let response = client()?
        .get(format!("{host}/api/tags"))
        .timeout(Duration::from_secs(5))
        .send()
        .await
        .map_err(map_err)?;
    let status = response.status();
    let body = response.text().await.map_err(|err| err.to_string())?;
    if !status.is_success() {
        return Err(error_message(&body));
    }
    let tags: TagsResponse = serde_json::from_str(&body).map_err(|err| err.to_string())?;
    let mut names: Vec<String> = tags
        .models
        .unwrap_or_default()
        .into_iter()
        .filter_map(|model| model.name)
        .filter(|name| normalize_model(name).is_ok())
        .collect();
    names.sort();
    names.dedup();
    Ok(names)
}

#[tauri::command]
pub async fn complete_line(host: String, model: String, line: String) -> Result<Completion, String> {
    let host = normalize_host(&host)?;
    let model = normalize_model(&model)?;
    let line = line.chars().take(300).collect::<String>();
    if line.trim().is_empty() {
        return Ok(Completion {
            text: String::new(),
            truncated: false,
        });
    }
    let response = client()?
        .post(format!("{host}/api/generate"))
        .timeout(Duration::from_secs(8))
        .json(&serde_json::json!({
            "model": model,
            "prompt": line,
            "stream": false,
            "raw": true,
            "think": false,
            "keep_alive": "30m",
            "options": {
                "num_predict": 16,
                "temperature": 0.2,
                "top_p": 0.9,
                "repeat_penalty": 1.08
            }
        }))
        .send()
        .await
        .map_err(map_err)?;
    let status = response.status();
    let body = response.text().await.map_err(|err| err.to_string())?;
    if !status.is_success() {
        return Err(error_message(&body));
    }
    let payload: GenerateResponse = serde_json::from_str(&body).map_err(|err| err.to_string())?;
    if let Some(error) = payload.error {
        return Err(error);
    }
    let text = payload
        .response
        .unwrap_or_default()
        .chars()
        .take(2000)
        .collect();
    Ok(Completion {
        truncated: payload.done_reason.as_deref() == Some("length"),
        text,
    })
}

const EDIT_SYSTEM: &str = "\
You edit a selected fragment of a note. Apply the instruction to that fragment and return only the replacement text. \
Keep the original language unless the instruction asks for a translation. \
Do not add a title, quotes, code fences, or any explanation.";

fn predict_budget(text: &str) -> u32 {
    let chars = text.chars().count() as u32;
    chars.div_ceil(3).saturating_add(64).clamp(192, 4096)
}

fn edit_prompt(instruction: &str, text: &str) -> Result<String, String> {
    let instruction = instruction.trim();
    if instruction.is_empty() || instruction.chars().count() > 500 {
        return Err("Write a short instruction.".into());
    }
    if text.trim().is_empty() {
        return Err("Select some text.".into());
    }
    if text.chars().count() > 8000 {
        return Err("Selection is too long.".into());
    }
    Ok(format!("Instruction:\n{instruction}\n\nSelected text:\n{text}"))
}

#[derive(Debug, Deserialize)]
struct ChatResponse {
    message: Option<ChatMessage>,
    error: Option<String>,
    done_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ChatMessage {
    content: Option<String>,
}

#[tauri::command]
pub async fn edit_selection(
    host: String,
    model: String,
    instruction: String,
    text: String,
) -> Result<String, String> {
    let host = normalize_host(&host)?;
    let model = normalize_model(&model)?;
    let prompt = edit_prompt(&instruction, &text)?;
    let response = client()?
        .post(format!("{host}/api/chat"))
        .timeout(Duration::from_secs(60))
        .json(&serde_json::json!({
            "model": model,
            "stream": false,
            "think": false,
            "keep_alive": "30m",
            "messages": [
                { "role": "system", "content": EDIT_SYSTEM },
                { "role": "user", "content": prompt }
            ],
            "options": {
                "temperature": 0.3,
                "num_predict": predict_budget(&text)
            }
        }))
        .send()
        .await
        .map_err(map_err)?;
    let status = response.status();
    let body = response.text().await.map_err(|err| err.to_string())?;
    if !status.is_success() {
        return Err(error_message(&body));
    }
    let payload: ChatResponse = serde_json::from_str(&body).map_err(|err| err.to_string())?;
    if let Some(error) = payload.error {
        return Err(error);
    }
    if payload.done_reason.as_deref() == Some("length") {
        return Err("The model stopped early. Select a shorter fragment.".into());
    }
    let content = payload
        .message
        .and_then(|message| message.content)
        .unwrap_or_default();
    if content.trim().is_empty() {
        return Err("The model returned nothing.".into());
    }
    Ok(content.chars().take(16000).collect())
}

#[cfg(test)]
mod tests {
    use super::{edit_prompt, predict_budget};

    #[test]
    fn edit_budget_stays_bounded() {
        assert!(predict_budget("hi") >= 192);
        assert!(predict_budget(&"a".repeat(20_000)) <= 4096);
    }

    #[test]
    fn edit_prompt_keeps_the_instruction_and_selection() {
        let prompt = edit_prompt("popraw gramatykę", "kot spi").unwrap();
        assert!(prompt.contains("popraw gramatykę"));
        assert!(prompt.contains("kot spi"));
        assert!(edit_prompt("  ", "kot").is_err());
        assert!(edit_prompt("fix", "   ").is_err());
    }
}

fn error_message(body: &str) -> String {
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(body) {
        if let Some(error) = value.get("error").and_then(|item| item.as_str()) {
            return error.to_string();
        }
    }
    let trimmed = body.trim();
    if trimmed.is_empty() {
        "Ollama request failed".into()
    } else {
        trimmed.chars().take(280).collect()
    }
}
