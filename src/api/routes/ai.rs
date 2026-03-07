// @group APIEndpoints : AI assistant endpoints — settings CRUD, OAuth Device Flow, model listing, streaming chat

use crate::api::error::ApiError;
use crate::daemon::state::DaemonState;
use crate::models::ai::{AiSettings, ChatRequest, DeviceAuthState};
use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{delete, get, post},
    Json, Router,
};
use bytes::Bytes;
use chrono::Utc;
use futures::StreamExt;
use serde_json::{json, Value};
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;

pub fn router(state: Arc<DaemonState>) -> Router {
    Router::new()
        .route("/settings", get(get_settings).put(save_settings))
        .route("/chat", post(chat))
        .route("/auth/start", post(auth_start))
        .route("/auth/status", get(auth_status))
        .route("/auth", delete(auth_logout))
        .route("/models", get(list_models))
        .with_state(state)
}

// @group Configuration : Path to ai-settings.json
fn settings_path() -> std::path::PathBuf {
    crate::config::paths::data_dir().join("ai-settings.json")
}

// @group Utilities > AI : Load AI settings from disk, return defaults if missing
fn load_settings() -> AiSettings {
    let path = settings_path();
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

// @group Utilities > AI : Persist AI settings to disk
fn persist_settings(settings: &AiSettings) -> Result<(), ApiError> {
    let path = settings_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| ApiError::internal(format!("cannot create data dir: {e}")))?;
    }
    let content = serde_json::to_string_pretty(settings)
        .map_err(|e| ApiError::internal(format!("serialize error: {e}")))?;
    std::fs::write(&path, content)
        .map_err(|e| ApiError::internal(format!("write error: {e}")))?;
    Ok(())
}

// @group APIEndpoints > AI : GET /ai/settings — load persisted AI config
async fn get_settings() -> Json<Value> {
    let settings = load_settings();
    // Never return the raw token to the frontend — only a masked hint
    let masked = if settings.github_token.is_empty() {
        String::new()
    } else {
        let token = &settings.github_token;
        if token.len() > 8 {
            format!("{}…{}", &token[..4], &token[token.len() - 4..])
        } else {
            "****".to_string()
        }
    };
    Json(json!({
        "github_token_set": !settings.github_token.is_empty(),
        "github_token_hint": masked,
        "model": settings.model,
        "enabled": settings.enabled,
        "github_username": settings.github_username,
        "client_id_set": !settings.client_id.is_empty(),
    }))
}

// @group APIEndpoints > AI : PUT /ai/settings — persist AI config
// Empty token or client_id strings are ignored (keep existing values).
async fn save_settings(Json(body): Json<Value>) -> Result<Json<Value>, ApiError> {
    let mut existing = load_settings();

    if let Some(token) = body.get("github_token").and_then(|v| v.as_str()) {
        if !token.is_empty() {
            existing.github_token = token.to_string();
        }
    }
    if let Some(model) = body.get("model").and_then(|v| v.as_str()) {
        existing.model = model.to_string();
    }
    if let Some(enabled) = body.get("enabled").and_then(|v| v.as_bool()) {
        existing.enabled = enabled;
    }
    if let Some(client_id) = body.get("client_id").and_then(|v| v.as_str()) {
        if !client_id.is_empty() {
            existing.client_id = client_id.to_string();
        }
    }

    persist_settings(&existing)?;
    Ok(Json(json!({ "success": true })))
}

// @group APIEndpoints > AI : POST /ai/auth/start — begin GitHub Device Flow
async fn auth_start(
    State(state): State<Arc<DaemonState>>,
) -> Result<Json<Value>, ApiError> {
    let settings = load_settings();

    if settings.client_id.is_empty() {
        return Err(ApiError::bad_request(
            "No GitHub OAuth App Client ID configured. Add one in Settings → AI Assistant.",
        ));
    }

    let client = reqwest::Client::new();
    let resp = client
        .post("https://github.com/login/device/code")
        .header("Accept", "application/json")
        .json(&json!({
            "client_id": settings.client_id,
            "scope": "models:read",
        }))
        .send()
        .await
        .map_err(|e| ApiError::internal(format!("GitHub request failed: {e}")))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(ApiError::internal(format!("GitHub Device Flow error {status}: {body}")));
    }

    let data: Value = resp
        .json()
        .await
        .map_err(|e| ApiError::internal(format!("Failed to parse GitHub response: {e}")))?;

    let device_code = data["device_code"].as_str().unwrap_or_default().to_string();
    let user_code = data["user_code"].as_str().unwrap_or_default().to_string();
    let verification_uri = data["verification_uri"].as_str().unwrap_or("https://github.com/login/device").to_string();
    let expires_in = data["expires_in"].as_u64().unwrap_or(900);
    let interval = data["interval"].as_u64().unwrap_or(5);

    if device_code.is_empty() || user_code.is_empty() {
        return Err(ApiError::internal("GitHub returned empty device_code or user_code"));
    }

    let auth_state = DeviceAuthState {
        device_code,
        user_code: user_code.clone(),
        verification_uri: verification_uri.clone(),
        expires_at: Utc::now() + chrono::Duration::seconds(expires_in as i64),
        interval_secs: interval,
    };

    *state.ai_device_auth.lock().await = Some(auth_state);

    Ok(Json(json!({
        "user_code": user_code,
        "verification_uri": verification_uri,
        "expires_in": expires_in,
        "interval": interval,
    })))
}

// @group APIEndpoints > AI : GET /ai/auth/status — poll GitHub token exchange
async fn auth_status(
    State(state): State<Arc<DaemonState>>,
) -> Result<Json<Value>, ApiError> {
    let settings = load_settings();
    let mut guard = state.ai_device_auth.lock().await;

    let auth = match guard.as_mut() {
        None => return Ok(Json(json!({ "status": "idle" }))),
        Some(a) => a,
    };

    // Check expiry
    if Utc::now() >= auth.expires_at {
        *guard = None;
        return Ok(Json(json!({ "status": "expired" })));
    }

    // Poll GitHub
    let client = reqwest::Client::new();
    let resp = client
        .post("https://github.com/login/oauth/access_token")
        .header("Accept", "application/json")
        .json(&json!({
            "client_id": settings.client_id,
            "device_code": auth.device_code,
            "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
        }))
        .send()
        .await
        .map_err(|e| ApiError::internal(format!("GitHub poll request failed: {e}")))?;

    let data: Value = resp
        .json()
        .await
        .map_err(|e| ApiError::internal(format!("Failed to parse GitHub poll response: {e}")))?;

    // Handle error field from GitHub
    if let Some(error) = data["error"].as_str() {
        match error {
            "authorization_pending" => {
                return Ok(Json(json!({ "status": "pending", "interval": auth.interval_secs })));
            }
            "slow_down" => {
                auth.interval_secs += 5;
                let new_interval = auth.interval_secs;
                return Ok(Json(json!({ "status": "pending", "interval": new_interval })));
            }
            "expired_token" => {
                *guard = None;
                return Ok(Json(json!({ "status": "expired" })));
            }
            "access_denied" => {
                *guard = None;
                return Ok(Json(json!({ "status": "denied" })));
            }
            other => {
                *guard = None;
                return Ok(Json(json!({ "status": "error", "message": other })));
            }
        }
    }

    // Success — access_token present
    if let Some(token) = data["access_token"].as_str() {
        let token = token.to_string();

        // Fetch GitHub username
        let username = fetch_github_username(&token).await.unwrap_or_default();

        // Persist token + username
        let mut new_settings = load_settings();
        new_settings.github_token = token;
        new_settings.github_username = username.clone();
        persist_settings(&new_settings)?;

        // Clear device auth state
        *guard = None;

        return Ok(Json(json!({ "status": "complete", "username": username })));
    }

    // Unexpected response
    Ok(Json(json!({ "status": "pending", "interval": auth.interval_secs })))
}

// @group APIEndpoints > AI : DELETE /ai/auth — disconnect GitHub account
async fn auth_logout(
    State(state): State<Arc<DaemonState>>,
) -> Result<Json<Value>, ApiError> {
    let mut settings = load_settings();
    settings.github_token = String::new();
    settings.github_username = String::new();
    persist_settings(&settings)?;

    *state.ai_device_auth.lock().await = None;

    Ok(Json(json!({ "success": true })))
}

// @group APIEndpoints > AI : GET /ai/models — list GitHub Models catalog (chat-completion only)
async fn list_models() -> Result<Json<Value>, ApiError> {
    let settings = load_settings();

    if settings.github_token.is_empty() {
        return Err(ApiError::bad_request(
            "No GitHub token configured. Sign in via Settings → AI Assistant.",
        ));
    }

    let client = reqwest::Client::new();
    let resp = client
        .get("https://models.github.ai/catalog/models")
        .header("Authorization", format!("Bearer {}", settings.github_token))
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
        .map_err(|e| ApiError::internal(format!("GitHub Models catalog request failed: {e}")))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(ApiError::internal(format!("GitHub Models catalog error {status}: {body}")));
    }

    let catalog: Value = resp
        .json()
        .await
        .map_err(|e| ApiError::internal(format!("Failed to parse catalog response: {e}")))?;

    // Filter to chat-completion capable models and extract relevant fields
    let models: Vec<Value> = catalog
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter(|m| {
            // Include models that support chat completion
            let supported_by_task = m["task"].as_str()
                .map(|t| t.contains("chat") || t.contains("completion"))
                .unwrap_or(false);
            let supported_by_cap = m["capabilities"]["chat_completion"].as_bool().unwrap_or(false)
                || m["supported_languages"].is_array(); // fallback heuristic
            supported_by_task || supported_by_cap
        })
        .map(|m| {
            // Prefer "id" field; fall back to "name" for the model identifier
            let id = m["id"].as_str()
                .or_else(|| m["name"].as_str())
                .unwrap_or("")
                .to_string();
            let display = m["friendly_name"].as_str()
                .or_else(|| m["display_name"].as_str())
                .or_else(|| m["name"].as_str())
                .unwrap_or(&id)
                .to_string();
            let publisher = m["publisher"].as_str().unwrap_or("").to_string();
            let summary = m["summary"].as_str()
                .or_else(|| m["description"].as_str())
                .unwrap_or("")
                .to_string();
            json!({ "id": id, "name": display, "publisher": publisher, "summary": summary })
        })
        .filter(|m| !m["id"].as_str().unwrap_or("").is_empty())
        .collect();

    Ok(Json(json!({ "models": models })))
}

// @group BusinessLogic > AI : POST /ai/chat — streaming SSE response from GitHub Models API
async fn chat(
    State(state): State<Arc<DaemonState>>,
    Json(req): Json<ChatRequest>,
) -> Result<Response, ApiError> {
    let settings = load_settings();

    if !settings.enabled {
        return Err(ApiError::bad_request("AI assistant is disabled. Enable it in Settings → AI Assistant."));
    }
    if settings.github_token.is_empty() {
        return Err(ApiError::bad_request("No GitHub token configured. Sign in via Settings → AI Assistant."));
    }

    // @group BusinessLogic > AI : Build system prompt with optional process context
    let system_content = build_system_prompt(&state, req.process_id.as_deref()).await;

    // Assemble messages: system + history + current user message
    let mut messages: Vec<serde_json::Value> = vec![
        json!({ "role": "system", "content": system_content }),
    ];
    for msg in &req.history {
        messages.push(json!({ "role": msg.role, "content": msg.content }));
    }
    messages.push(json!({ "role": "user", "content": req.message }));

    // @group BusinessLogic > AI : Stream tokens from GitHub Models API
    let token = settings.github_token.clone();
    let model = settings.model.clone();

    let (tx, rx) = mpsc::channel::<Result<Bytes, std::convert::Infallible>>(64);

    tokio::spawn(async move {
        if let Err(e) = stream_github_models(token, model, messages, tx.clone()).await {
            let err_event = format!("data: {}\n\n", json!({ "error": e.to_string() }));
            let _ = tx.send(Ok(Bytes::from(err_event))).await;
        }
        let done_event = format!("data: {}\n\n", json!({ "done": true }));
        let _ = tx.send(Ok(Bytes::from(done_event))).await;
    });

    let stream = ReceiverStream::new(rx);
    let body = axum::body::Body::from_stream(stream);

    let mut headers = HeaderMap::new();
    headers.insert("Content-Type", "text/event-stream".parse().unwrap());
    headers.insert("Cache-Control", "no-cache".parse().unwrap());
    headers.insert("X-Accel-Buffering", "no".parse().unwrap());

    Ok((StatusCode::OK, headers, body).into_response())
}

// @group BusinessLogic > AI : Fetch process info + logs and build system prompt
async fn build_system_prompt(state: &DaemonState, process_id: Option<&str>) -> String {
    let base = "You are an AI assistant embedded in alter, a process manager for developers. \
                Answer questions about running processes, logs, crashes, and configuration concisely. \
                Use plain text — no markdown formatting.";

    let Some(pid_str) = process_id else {
        // No process context — include a summary of all running processes
        let processes = state.manager.list().await;
        let running: Vec<_> = processes.iter()
            .filter(|p| matches!(p.status, crate::models::process_status::ProcessStatus::Running
                | crate::models::process_status::ProcessStatus::Watching
                | crate::models::process_status::ProcessStatus::Sleeping))
            .collect();
        let stopped: Vec<_> = processes.iter()
            .filter(|p| matches!(p.status, crate::models::process_status::ProcessStatus::Stopped
                | crate::models::process_status::ProcessStatus::Crashed))
            .collect();
        return format!(
            "{base}\n\nCurrent state: {total} processes total, {r} active, {s} stopped/crashed.\nActive: {active}\nStopped/crashed: {inactive}",
            total = processes.len(),
            r = running.len(),
            s = stopped.len(),
            active = running.iter().map(|p| p.name.as_str()).collect::<Vec<_>>().join(", "),
            inactive = stopped.iter().map(|p| format!("{} ({})", p.name, format!("{:?}", p.status).to_lowercase())).collect::<Vec<_>>().join(", "),
        );
    };

    // Resolve process by id or name
    let id = match state.manager.resolve_id(pid_str).await {
        Ok(id) => id,
        Err(_) => return base.to_string(),
    };
    let info = match state.manager.get(id).await {
        Ok(info) => info,
        Err(_) => return base.to_string(),
    };

    // Fetch last 200 log lines
    let log_dir = crate::config::paths::process_log_dir(&info.name);
    let log_lines = crate::logging::reader::read_merged_logs(&log_dir, 200).unwrap_or_default();
    let log_text: String = log_lines
        .iter()
        .map(|(stream, ts, content)| format!("[{stream}] {ts} {content}"))
        .collect::<Vec<_>>()
        .join("\n");

    format!(
        "{base}\n\nProcess context:\n\
         Name: {name} | Status: {status} | Restarts: {restarts}\n\
         Command: {script} {args}\n\
         Working dir: {cwd}\n\
         Namespace: {ns}\n\
         PID: {pid}\n\
         \nRecent logs (last 200 lines):\n{logs}",
        name = info.name,
        status = format!("{:?}", info.status).to_lowercase(),
        restarts = info.restart_count,
        script = info.script,
        args = info.args.join(" "),
        cwd = info.cwd.as_deref().unwrap_or(""),
        ns = info.namespace,
        pid = info.pid.map(|p| p.to_string()).unwrap_or_else(|| "none".to_string()),
        logs = if log_text.is_empty() { "(no logs)".to_string() } else { log_text },
    )
}

// @group BusinessLogic > AI : Call GitHub Models API with streaming and forward SSE chunks
async fn stream_github_models(
    token: String,
    model: String,
    messages: Vec<serde_json::Value>,
    tx: mpsc::Sender<Result<Bytes, std::convert::Infallible>>,
) -> anyhow::Result<()> {
    let client = reqwest::Client::new();
    let resp = client
        .post("https://models.github.ai/inference/chat/completions")
        .header("Authorization", format!("Bearer {token}"))
        .header("Content-Type", "application/json")
        .json(&json!({
            "model": model,
            "messages": messages,
            "stream": true,
            "max_tokens": 1024,
            "temperature": 0.7,
        }))
        .send()
        .await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        anyhow::bail!("GitHub Models API error {status}: {body}");
    }

    // @group BusinessLogic > AI : Parse SSE chunks from GitHub Models and forward deltas
    let mut stream = resp.bytes_stream();
    let mut buf = String::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        buf.push_str(&String::from_utf8_lossy(&chunk));

        // Process complete SSE lines
        while let Some(newline_pos) = buf.find('\n') {
            let line = buf[..newline_pos].trim_end_matches('\r').to_string();
            buf = buf[newline_pos + 1..].to_string();

            if line.starts_with("data: ") {
                let data = &line[6..];
                if data == "[DONE]" {
                    return Ok(());
                }
                if let Ok(chunk_val) = serde_json::from_str::<Value>(data) {
                    if let Some(delta_content) = chunk_val
                        .get("choices")
                        .and_then(|c| c.get(0))
                        .and_then(|c| c.get("delta"))
                        .and_then(|d| d.get("content"))
                        .and_then(|c| c.as_str())
                    {
                        if !delta_content.is_empty() {
                            let event = format!(
                                "data: {}\n\n",
                                json!({ "delta": delta_content })
                            );
                            tx.send(Ok(Bytes::from(event))).await?;
                        }
                    }
                }
            }
        }
    }

    Ok(())
}

// @group Utilities > AI : Fetch the GitHub username for a given token
async fn fetch_github_username(token: &str) -> anyhow::Result<String> {
    let client = reqwest::Client::new();
    let resp = client
        .get("https://api.github.com/user")
        .header("Authorization", format!("Bearer {token}"))
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .header("User-Agent", "alter-pm2")
        .send()
        .await?;

    let data: Value = resp.json().await?;
    let login = data["login"].as_str().unwrap_or("").to_string();
    Ok(login)
}
