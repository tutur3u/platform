use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorizationError, authorize_finance_permission},
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const TAG_DETAIL_PATH_PREFIX: &str = "/api/workspaces/";
const TAG_DETAIL_PATH_INFIX: &str = "/tags/";
const MANAGE_FINANCE_PERMISSION: &str = "manage_finance";
const TRANSACTION_TAGS_TABLE: &str = "transaction_tags";

const INVALID_TAG_ID_MESSAGE: &str = "Invalid tagId: must be a valid UUID";
const TAG_FETCH_ERROR_MESSAGE: &str = "Error fetching tag";
const TAG_NOT_FOUND_MESSAGE: &str = "Tag not found";

// `stats` is owned by the sibling `/api/workspaces/{wsId}/tags/stats` route
// handler, so this dynamic `:tagId` handler must not claim it.
const RESERVED_TAG_SEGMENT_STATS: &str = "stats";

pub(crate) async fn handle_workspaces_tags_tagid_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (ws_id, tag_id) = tag_detail_segments(request.path)?;

    // Only the GET method is migrated. Returning None for every other method
    // lets the Cloudflare worker fall through to the still-active Next.js route
    // (which still owns PUT/DELETE) instead of returning a 405 that would reject
    // a still-valid mutation.
    Some(match request.method {
        "GET" => tag_detail_response(config, request, ws_id, tag_id, outbound).await,
        _ => return None,
    })
}

async fn tag_detail_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    tag_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // The legacy route validates the tagId is a UUID *before* doing any auth
    // work, returning 400 for a malformed id.
    if !is_uuid_literal(tag_id) {
        return invalid_tag_id_response();
    }

    let authorization = match authorize_finance_permission(
        config,
        request,
        raw_ws_id,
        MANAGE_FINANCE_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization,
        Err(FinanceAuthorizationError::Unauthorized | FinanceAuthorizationError::NotFound) => {
            return unauthorized_response();
        }
        Err(FinanceAuthorizationError::Forbidden) => return insufficient_permissions_response(),
        Err(FinanceAuthorizationError::Internal) => return tag_fetch_error_response(),
    };

    match fetch_tag(&config.contact_data, outbound, &authorization.ws_id, tag_id).await {
        Ok(Some(tag)) => no_store_response(json_response(200, tag)),
        Ok(None) => not_found_response(),
        Err(()) => tag_fetch_error_response(),
    }
}

async fn fetch_tag(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    tag_id: &str,
) -> Result<Option<Value>, ()> {
    // Mirrors the legacy `sbAdmin.from('transaction_tags').select('*')` query,
    // filtered by `id` and `ws_id`. The legacy route uses the admin (service
    // role) client, so go through service-role auth here as well.
    let Some(url) = contact_data.rest_url(
        TRANSACTION_TAGS_TABLE,
        &[
            ("select", "*".to_owned()),
            ("id", format!("eq.{tag_id}")),
            ("ws_id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    // `.maybeSingle()` returns the single matching row or null; PostgREST with a
    // filter + limit returns an array, so take the first row (mirrors the
    // `!data` 404 branch when empty).
    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;

    Ok(rows.into_iter().next())
}

fn tag_detail_segments(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix(TAG_DETAIL_PATH_PREFIX)?;
    let infix_start = rest.find(TAG_DETAIL_PATH_INFIX)?;
    let ws_id = &rest[..infix_start];
    let tag_id = &rest[infix_start + TAG_DETAIL_PATH_INFIX.len()..];

    // ws_id must be a single, non-empty segment.
    if ws_id.is_empty() || ws_id.contains('/') {
        return None;
    }

    // tag_id must be a single, non-empty trailing segment. Reject nested routes
    // and the reserved `stats` sibling so this handler only claims the exact
    // `/api/workspaces/{wsId}/tags/{tagId}` detail route.
    if tag_id.is_empty() || tag_id.contains('/') || tag_id == RESERVED_TAG_SEGMENT_STATS {
        return None;
    }

    Some((ws_id, tag_id))
}

// Mirrors `z.guid()` validation: a canonical 8-4-4-4-12 hex UUID literal.
fn is_uuid_literal(value: &str) -> bool {
    value.len() == 36
        && value
            .chars()
            .enumerate()
            .all(|(index, character)| match index {
                8 | 13 | 18 | 23 => character == '-',
                _ => character.is_ascii_hexdigit(),
            })
}

fn invalid_tag_id_response() -> BackendResponse {
    no_store_response(json_response(
        400,
        json!({ "message": INVALID_TAG_ID_MESSAGE }),
    ))
}

fn unauthorized_response() -> BackendResponse {
    no_store_response(json_response(401, json!({ "message": "Unauthorized" })))
}

fn insufficient_permissions_response() -> BackendResponse {
    no_store_response(json_response(
        403,
        json!({ "message": "Insufficient permissions" }),
    ))
}

fn not_found_response() -> BackendResponse {
    no_store_response(json_response(
        404,
        json!({ "message": TAG_NOT_FOUND_MESSAGE }),
    ))
}

fn tag_fetch_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "message": TAG_FETCH_ERROR_MESSAGE }),
    ))
}
