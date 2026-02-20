// @group BusinessLogic : Embedded web dashboard served via rust-embed

use axum::{
    body::Body,
    http::{header, Response, StatusCode},
    response::IntoResponse,
    routing::get,
    Router,
};
use rust_embed::Embed;

#[derive(Embed)]
#[folder = "src/web/assets/"]
struct Assets;

pub fn router() -> Router {
    Router::new()
        .route("/", get(serve_index))
        .route("/app.js", get(serve_app_js))
        .route("/style.css", get(serve_style_css))
}

async fn serve_index() -> impl IntoResponse {
    serve_asset("index.html", "text/html; charset=utf-8")
}

async fn serve_app_js() -> impl IntoResponse {
    serve_asset("app.js", "application/javascript; charset=utf-8")
}

async fn serve_style_css() -> impl IntoResponse {
    serve_asset("style.css", "text/css; charset=utf-8")
}

fn serve_asset(name: &str, content_type: &'static str) -> Response<Body> {
    match Assets::get(name) {
        Some(asset) => Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, content_type)
            .body(Body::from(asset.data.to_vec()))
            .unwrap(),
        None => Response::builder()
            .status(StatusCode::NOT_FOUND)
            .body(Body::from("not found"))
            .unwrap(),
    }
}
