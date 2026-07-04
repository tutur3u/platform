//! Backend request dispatcher (extracted from `lib.rs`).
//!
//! `handle_backend_request` fans every request through the chunked
//! `dispatch_chunk_NN` route tables (one per submodule). New route arms are
//! appended to a `dispatch_chunk_NN` file; add a new `chunk_NN` module + a
//! `dispatch_chunk_NN(...)` call here when a chunk fills up. Pure movement out
//! of the crate root; `use crate::*` brings root helpers/types/modules in.

use crate::*;

mod dispatch_chunk_00;
mod dispatch_chunk_01;
mod dispatch_chunk_02;
mod dispatch_chunk_03;
mod dispatch_chunk_04;
mod dispatch_chunk_05;
mod dispatch_chunk_06;
mod dispatch_chunk_07;
mod dispatch_chunk_08;
mod dispatch_chunk_09;
mod dispatch_chunk_10;
mod dispatch_chunk_11;
mod dispatch_chunk_12;
mod dispatch_chunk_13;
mod dispatch_chunk_14;
mod dispatch_chunk_15;
mod dispatch_chunk_16;
mod dispatch_chunk_17;
mod dispatch_chunk_18;
mod dispatch_chunk_19;
mod dispatch_chunk_20;
mod dispatch_chunk_21;
mod dispatch_chunk_22;
mod dispatch_chunk_23;

use dispatch_chunk_00::dispatch_chunk_00;
use dispatch_chunk_01::dispatch_chunk_01;
use dispatch_chunk_02::dispatch_chunk_02;
use dispatch_chunk_03::dispatch_chunk_03;
use dispatch_chunk_04::dispatch_chunk_04;
use dispatch_chunk_05::dispatch_chunk_05;
use dispatch_chunk_06::dispatch_chunk_06;
use dispatch_chunk_07::dispatch_chunk_07;
use dispatch_chunk_08::dispatch_chunk_08;
use dispatch_chunk_09::dispatch_chunk_09;
use dispatch_chunk_10::dispatch_chunk_10;
use dispatch_chunk_11::dispatch_chunk_11;
use dispatch_chunk_12::dispatch_chunk_12;
use dispatch_chunk_13::dispatch_chunk_13;
use dispatch_chunk_14::dispatch_chunk_14;
use dispatch_chunk_15::dispatch_chunk_15;
use dispatch_chunk_16::dispatch_chunk_16;
use dispatch_chunk_17::dispatch_chunk_17;
use dispatch_chunk_18::dispatch_chunk_18;
use dispatch_chunk_19::dispatch_chunk_19;
use dispatch_chunk_20::dispatch_chunk_20;
use dispatch_chunk_21::dispatch_chunk_21;
use dispatch_chunk_22::dispatch_chunk_22;
use dispatch_chunk_23::dispatch_chunk_23;

pub(crate) async fn handle_backend_request(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl outbound::OutboundHttpClient,
) -> BackendResponse {
    if let Some(response) = dispatch_chunk_00(config, request, outbound).await {
        return response;
    }

    if let Some(response) = dispatch_chunk_01(config, request, outbound).await {
        return response;
    }

    if let Some(response) = dispatch_chunk_02(config, request, outbound).await {
        return response;
    }

    if let Some(response) = dispatch_chunk_03(config, request, outbound).await {
        return response;
    }

    if let Some(response) = dispatch_chunk_04(config, request, outbound).await {
        return response;
    }

    if let Some(response) = dispatch_chunk_05(config, request, outbound).await {
        return response;
    }

    if let Some(response) = dispatch_chunk_06(config, request, outbound).await {
        return response;
    }

    if let Some(response) = dispatch_chunk_07(config, request, outbound).await {
        return response;
    }

    if let Some(response) = dispatch_chunk_08(config, request, outbound).await {
        return response;
    }

    if let Some(response) = dispatch_chunk_09(config, request, outbound).await {
        return response;
    }

    if let Some(response) = dispatch_chunk_10(config, request, outbound).await {
        return response;
    }

    if let Some(response) = dispatch_chunk_11(config, request, outbound).await {
        return response;
    }

    if let Some(response) = dispatch_chunk_12(config, request, outbound).await {
        return response;
    }

    if let Some(response) = dispatch_chunk_13(config, request, outbound).await {
        return response;
    }

    if let Some(response) = dispatch_chunk_14(config, request, outbound).await {
        return response;
    }

    if let Some(response) = dispatch_chunk_15(config, request, outbound).await {
        return response;
    }

    if let Some(response) = dispatch_chunk_16(config, request, outbound).await {
        return response;
    }

    if let Some(response) = dispatch_chunk_17(config, request, outbound).await {
        return response;
    }

    if let Some(response) = dispatch_chunk_18(config, request, outbound).await {
        return response;
    }

    if let Some(response) = dispatch_chunk_19(config, request, outbound).await {
        return response;
    }

    if let Some(response) = dispatch_chunk_20(config, request, outbound).await {
        return response;
    }

    if let Some(response) = dispatch_chunk_21(config, request, outbound).await {
        return response;
    }

    if let Some(response) = dispatch_chunk_22(config, request, outbound).await {
        return response;
    }

    if let Some(response) = dispatch_chunk_23(config, request, outbound).await {
        return response;
    }

    route_request(config, request)
}

async fn handle_discord_cron_proxy(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl outbound::OutboundHttpClient,
) -> Option<BackendResponse> {
    let upstream_path = match request.path {
        DISCORD_DAILY_REPORT_CRON_PATH => DISCORD_DAILY_REPORT_UPSTREAM_PATH,
        DISCORD_WOL_DAILY_REMIND_CRON_PATH => DISCORD_WOL_DAILY_REMIND_UPSTREAM_PATH,
        _ => return None,
    };

    if request.method != "GET" {
        return Some(method_not_allowed(request.method, "GET"));
    }

    if config.cron_secret.is_empty() {
        return Some(no_store_response(json_response(
            500,
            json!({
                "ok": false,
                "error": MISSING_CRON_SECRET_MESSAGE,
            }),
        )));
    }

    let expected_authorization = format!("Bearer {}", config.cron_secret);

    if !constant_time_eq(
        request.authorization.unwrap_or_default().as_bytes(),
        expected_authorization.as_bytes(),
    ) {
        return Some(no_store_response(json_response(
            401,
            json!({
                "ok": false,
            }),
        )));
    }

    if config.discord_app_deployment_url.is_empty() {
        return Some(no_store_response(json_response(
            500,
            json!({
                "ok": false,
                "error": MISSING_DISCORD_APP_DEPLOYMENT_URL_MESSAGE,
            }),
        )));
    }

    let upstream_url = format!("{}{}", config.discord_app_deployment_url, upstream_path);
    let upstream_request =
        outbound::OutboundRequest::new(outbound::OutboundMethod::Post, &upstream_url)
            .with_header("Content-Type", APPLICATION_JSON)
            .with_header("Authorization", &expected_authorization);

    let upstream_response = match outbound.send(upstream_request).await {
        Ok(response) => response,
        Err(_) => {
            return Some(no_store_response(json_response(
                502,
                json!({
                    "ok": false,
                    "error": DISCORD_APP_REQUEST_FAILED_MESSAGE,
                }),
            )));
        }
    };
    let status = upstream_response.status;
    let body = upstream_response.json::<Value>().unwrap_or_else(|_| {
        json!({
            "ok": false,
            "error": INVALID_DISCORD_JSON_MESSAGE,
        })
    });

    Some(no_store_response(json_response(status, body)))
}
