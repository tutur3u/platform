// Route-level callers land in separate migration slices; keep the shared
// native/Worker boundary compiled before every method is exercised.
#![allow(dead_code)]

use serde::de::DeserializeOwned;
use std::fmt;
use std::future::Future;
use std::pin::Pin;

#[cfg(not(all(feature = "worker", target_arch = "wasm32")))]
pub(crate) type OutboundFuture<'a> =
    Pin<Box<dyn Future<Output = Result<OutboundResponse, OutboundError>> + Send + 'a>>;

#[cfg(all(feature = "worker", target_arch = "wasm32"))]
pub(crate) type OutboundFuture<'a> =
    Pin<Box<dyn Future<Output = Result<OutboundResponse, OutboundError>> + 'a>>;

pub(crate) trait OutboundHttpClient {
    fn send<'a>(&'a self, request: OutboundRequest<'a>) -> OutboundFuture<'a>;
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum OutboundMethod {
    Delete,
    Get,
    Patch,
    Post,
    Put,
}

impl OutboundMethod {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Delete => "DELETE",
            Self::Get => "GET",
            Self::Patch => "PATCH",
            Self::Post => "POST",
            Self::Put => "PUT",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct OutboundHeader<'a> {
    pub(crate) name: &'a str,
    pub(crate) value: &'a str,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct OutboundRequest<'a> {
    pub(crate) body: Option<&'a str>,
    pub(crate) headers: Vec<OutboundHeader<'a>>,
    pub(crate) method: OutboundMethod,
    pub(crate) url: &'a str,
}

impl<'a> OutboundRequest<'a> {
    pub(crate) fn new(method: OutboundMethod, url: &'a str) -> Self {
        Self {
            body: None,
            headers: Vec::new(),
            method,
            url,
        }
    }

    pub(crate) fn with_header(mut self, name: &'a str, value: &'a str) -> Self {
        self.headers.push(OutboundHeader { name, value });
        self
    }

    pub(crate) fn with_body(mut self, body: &'a str) -> Self {
        self.body = Some(body);
        self
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct OutboundResponse {
    pub(crate) body_text: String,
    pub(crate) headers: Vec<(String, String)>,
    pub(crate) status: u16,
}

impl OutboundResponse {
    pub(crate) fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(header_name, _)| header_name.eq_ignore_ascii_case(name))
            .map(|(_, value)| value.as_str())
    }

    pub(crate) fn json<T: DeserializeOwned>(&self) -> Result<T, OutboundError> {
        serde_json::from_str(&self.body_text).map_err(|error| {
            OutboundError::Body(format!("outbound response JSON parse failed: {error}"))
        })
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum OutboundError {
    Body(String),
    Header(String),
    InvalidMethod(String),
    InvalidUrl(String),
    Transport(String),
}

impl fmt::Display for OutboundError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Body(message)
            | Self::Header(message)
            | Self::InvalidMethod(message)
            | Self::InvalidUrl(message)
            | Self::Transport(message) => formatter.write_str(message),
        }
    }
}

impl std::error::Error for OutboundError {}

#[cfg(feature = "native")]
#[derive(Clone)]
pub(crate) struct NativeOutboundHttpClient {
    client: reqwest::Client,
}

#[cfg(feature = "native")]
impl Default for NativeOutboundHttpClient {
    fn default() -> Self {
        ensure_native_rustls_provider();

        Self {
            client: reqwest::Client::new(),
        }
    }
}

#[cfg(feature = "native")]
fn ensure_native_rustls_provider() {
    static INSTALL_PROVIDER: std::sync::Once = std::sync::Once::new();

    INSTALL_PROVIDER.call_once(|| {
        let _ = rustls::crypto::ring::default_provider().install_default();
    });
}

#[cfg(feature = "native")]
impl OutboundHttpClient for NativeOutboundHttpClient {
    fn send<'a>(&'a self, request: OutboundRequest<'a>) -> OutboundFuture<'a> {
        Box::pin(async move {
            let method = reqwest::Method::from_bytes(request.method.as_str().as_bytes()).map_err(
                |error| {
                    OutboundError::InvalidMethod(format!(
                        "invalid outbound HTTP method {}: {error}",
                        request.method.as_str()
                    ))
                },
            )?;
            let mut builder = self.client.request(method, request.url);

            for header in request.headers {
                builder = builder.header(header.name, header.value);
            }

            if let Some(body) = request.body {
                builder = builder.body(body.to_owned());
            }

            let response = builder
                .send()
                .await
                .map_err(|error| OutboundError::Transport(error.to_string()))?;
            let status = response.status().as_u16();
            let headers = response
                .headers()
                .iter()
                .filter_map(|(name, value)| {
                    value
                        .to_str()
                        .ok()
                        .map(|value| (name.as_str().to_owned(), value.to_owned()))
                })
                .collect();
            let body_text = response
                .text()
                .await
                .map_err(|error| OutboundError::Body(error.to_string()))?;

            Ok(OutboundResponse {
                body_text,
                headers,
                status,
            })
        })
    }
}

#[cfg(all(feature = "worker", target_arch = "wasm32"))]
#[derive(Clone, Copy, Default)]
pub(crate) struct WorkerFetchOutboundHttpClient;

#[cfg(all(feature = "worker", target_arch = "wasm32"))]
impl OutboundHttpClient for WorkerFetchOutboundHttpClient {
    fn send<'a>(&'a self, request: OutboundRequest<'a>) -> OutboundFuture<'a> {
        Box::pin(async move {
            let url = url::Url::parse(request.url)
                .map_err(|error| OutboundError::InvalidUrl(error.to_string()))?;
            let headers = worker::Headers::new();

            for header in request.headers {
                headers
                    .set(header.name, header.value)
                    .map_err(|error| OutboundError::Header(error.to_string()))?;
            }

            let mut init = worker::RequestInit::new();
            init.with_method(worker_method(request.method))
                .with_headers(headers);

            if let Some(body) = request.body {
                init.with_body(Some(worker::wasm_bindgen::JsValue::from_str(body)));
            }

            let worker_request =
                worker::Request::new_with_init(url.as_str(), &init).map_err(|error| {
                    OutboundError::InvalidUrl(format!("outbound worker request failed: {error}"))
                })?;
            let mut response = worker::Fetch::Request(worker_request)
                .send()
                .await
                .map_err(|error| OutboundError::Transport(error.to_string()))?;
            let status = response.status_code();
            let headers = response.headers().entries().collect();
            let body_text = response
                .text()
                .await
                .map_err(|error| OutboundError::Body(error.to_string()))?;

            Ok(OutboundResponse {
                body_text,
                headers,
                status,
            })
        })
    }
}

#[cfg(all(feature = "worker", target_arch = "wasm32"))]
fn worker_method(method: OutboundMethod) -> worker::Method {
    match method {
        OutboundMethod::Delete => worker::Method::Delete,
        OutboundMethod::Get => worker::Method::Get,
        OutboundMethod::Patch => worker::Method::Patch,
        OutboundMethod::Post => worker::Method::Post,
        OutboundMethod::Put => worker::Method::Put,
    }
}
