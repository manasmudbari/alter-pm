// @group BusinessLogic : Embedded React SPA served via rust-embed with SPA fallback

use axum::{
    body::Body,
    http::{header, Response, StatusCode, Uri},
    response::IntoResponse,
    routing::get,
    Router,
};
use rust_embed::Embed;

#[derive(Embed)]
#[folder = "web-ui/dist/"]
struct Assets;

pub fn router() -> Router {
    Router::new().fallback(get(serve_spa))
}

async fn serve_spa(uri: Uri) -> impl IntoResponse {
    let path = uri.path().trim_start_matches('/');
    let path = if path.is_empty() { "index.html" } else { path };

    match Assets::get(path) {
        Some(asset) => {
            let mime = mime_guess::from_path(path).first_or_octet_stream();
            Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, mime.as_ref())
                .body(Body::from(asset.data.to_vec()))
                .unwrap()
        }
        // SPA fallback — serve index.html for client-side routes
        None => match Assets::get("index.html") {
            Some(asset) => Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
                .body(Body::from(asset.data.to_vec()))
                .unwrap(),
            None => Response::builder()
                .status(StatusCode::NOT_FOUND)
                .body(Body::from("not found"))
                .unwrap(),
        },
    }
}
