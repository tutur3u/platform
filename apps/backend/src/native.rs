use super::{
    BackendConfig, BackendRequest, BackendResponse, MAX_REQUEST_BODY_BYTES, handle_backend_request,
    json_security_headers, outbound, request_body_too_large_response, should_buffer_request_body,
};
use axum::Router;
use axum::body::{Body, to_bytes};
use axum::extract::State;
use axum::http::header::{
    ALLOW, AUTHORIZATION, CACHE_CONTROL, CONTENT_TYPE, COOKIE, HOST, IF_NONE_MATCH, ORIGIN, REFERER,
};
use axum::http::{HeaderValue, Request, Response, StatusCode};
use std::net::{IpAddr, Ipv4Addr, SocketAddr};

#[derive(Clone)]
struct NativeState {
    config: BackendConfig,
    outbound: outbound::NativeOutboundHttpClient,
}

pub fn router(config: BackendConfig) -> Router {
    Router::new().fallback(handle).with_state(NativeState {
        config,
        outbound: outbound::NativeOutboundHttpClient::default(),
    })
}

pub fn listen_addr(config: &BackendConfig) -> SocketAddr {
    SocketAddr::new(IpAddr::V4(Ipv4Addr::UNSPECIFIED), config.port)
}

pub fn healthcheck_addr(config: &BackendConfig) -> SocketAddr {
    SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), config.port)
}

async fn handle(State(state): State<NativeState>, request: Request<Body>) -> Response<Body> {
    let (parts, body) = request.into_parts();
    let method = parts.method.as_str().to_owned();
    let path = parts.uri.path().to_owned();
    let url = native_request_url(&parts.uri, &parts.headers);
    let authorization = parts
        .headers
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);
    let request_id = parts
        .headers
        .get("X-Request-Id")
        .or_else(|| parts.headers.get("X-Request-ID"))
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);
    let cookie = parts
        .headers
        .get(COOKIE)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);
    let if_none_match = parts
        .headers
        .get(IF_NONE_MATCH)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);
    let origin = parts
        .headers
        .get(ORIGIN)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);
    let referer = parts
        .headers
        .get(REFERER)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);
    let body_text = if should_buffer_request_body(&method, &path) {
        match buffer_native_request_body(body).await {
            Ok(body_text) => body_text,
            Err(response) => return response.into_response(),
        }
    } else {
        None
    };

    handle_backend_request(
        &state.config,
        BackendRequest {
            authorization: authorization.as_deref(),
            body_text: body_text.as_deref(),
            cookie: cookie.as_deref(),
            if_none_match: if_none_match.as_deref(),
            method: &method,
            origin: origin.as_deref(),
            path: &path,
            referer: referer.as_deref(),
            request_id: request_id.as_deref(),
            url: Some(url.as_str()),
        },
        &state.outbound,
    )
    .await
    .into_response()
}

pub(super) async fn buffer_native_request_body(
    body: Body,
) -> Result<Option<String>, BackendResponse> {
    let bytes = to_bytes(body, MAX_REQUEST_BODY_BYTES)
        .await
        .map_err(|_| request_body_too_large_response())?;

    Ok(String::from_utf8(bytes.to_vec()).ok())
}

fn native_request_url(uri: &axum::http::Uri, headers: &axum::http::HeaderMap) -> String {
    if uri.scheme().is_some() && uri.authority().is_some() {
        return uri.to_string();
    }

    let scheme = headers
        .get("x-forwarded-proto")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(',').next())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("http");
    let host = headers
        .get(HOST)
        .and_then(|value| value.to_str().ok())
        .filter(|value| !value.is_empty())
        .unwrap_or("localhost");

    format!("{scheme}://{host}{uri}")
}

impl BackendResponse {
    fn into_response(self) -> Response<Body> {
        let mut response = Response::builder()
            .status(StatusCode::from_u16(self.status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR));

        if let Some(content_type) = self.content_type {
            response = response.header(CONTENT_TYPE, HeaderValue::from_static(content_type));
        }

        if let Some(allow) = self.allow {
            response = response.header(ALLOW, HeaderValue::from_static(allow));
        }

        if let Some(cache_control) = self.cache_control {
            response = response.header(CACHE_CONTROL, HeaderValue::from_static(cache_control));
        }

        if self.content_type == Some(super::APPLICATION_JSON) {
            for &(name, value) in json_security_headers() {
                response = response.header(name, HeaderValue::from_static(value));
            }
        }

        for (name, value) in self.headers {
            response = response.header(name, value);
        }

        let body = if let Some(body_text) = self.body_text {
            body_text
        } else if self.body_empty {
            String::new()
        } else {
            self.body.to_string()
        };

        response
            .body(Body::from(body))
            .unwrap_or_else(|_| Response::new(Body::from(r#"{"error":"response"}"#)))
    }
}
