use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    BackendConfig, BackendRequest, BackendResponse, contact, json_response, method_not_allowed,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const CHANGELOG_SLUG_PATH_PREFIX: &str = "/api/v1/infrastructure/changelog/slug/";
const CHANGELOG_ENTRIES_TABLE: &str = "changelog_entries";
const CHANGELOG_ENTRY_NOT_FOUND_MESSAGE: &str = "Changelog entry not found";
const POSTGREST_SINGLE_JSON: &str = "application/vnd.pgrst.object+json";
const POSTGREST_SINGULAR_RESPONSE_ERROR_CODE: &str = "PGRST116";

#[derive(Deserialize)]
struct PostgrestError {
    code: Option<String>,
}

pub(crate) async fn handle_changelog_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let slug = changelog_slug(request.path)?;

    Some(match request.method {
        "GET" => changelog_slug_response(&config.contact_data, slug, outbound).await,
        method => method_not_allowed(method, "GET"),
    })
}

async fn changelog_slug_response(
    contact_data: &contact::ContactDataConfig,
    slug: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if !contact_data.configured() {
        return changelog_error_response(500);
    }

    let Some(url) = contact_data.rest_url(
        CHANGELOG_ENTRIES_TABLE,
        &[
            ("select", "*".to_owned()),
            ("slug", format!("eq.{slug}")),
            ("is_published", "eq.true".to_owned()),
            ("published_at", "not.is.null".to_owned()),
        ],
    ) else {
        return changelog_error_response(500);
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return changelog_error_response(500);
    };

    let authorization = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", POSTGREST_SINGLE_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await;

    let Ok(response) = response else {
        return changelog_error_response(500);
    };

    if !(200..300).contains(&response.status) {
        return changelog_error_response(if is_postgrest_single_not_found(&response) {
            404
        } else {
            500
        });
    }

    match response.json::<Value>() {
        Ok(body) => no_store_response(json_response(200, body)),
        Err(_) => changelog_error_response(500),
    }
}

fn changelog_slug(path: &str) -> Option<&str> {
    let slug = path.strip_prefix(CHANGELOG_SLUG_PATH_PREFIX)?;

    (!slug.is_empty() && !slug.contains('/')).then_some(slug)
}

fn is_postgrest_single_not_found(response: &crate::outbound::OutboundResponse) -> bool {
    response
        .json::<PostgrestError>()
        .ok()
        .and_then(|error| error.code)
        .as_deref()
        == Some(POSTGREST_SINGULAR_RESPONSE_ERROR_CODE)
}

fn changelog_error_response(status: u16) -> BackendResponse {
    no_store_response(json_response(
        status,
        json!({
            "message": CHANGELOG_ENTRY_NOT_FOUND_MESSAGE,
        }),
    ))
}
