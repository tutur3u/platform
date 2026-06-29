//! Handler for `GET /api/v1/workspaces/:wsId/settings/configs`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/settings/configs/route.ts`
//! (GET only; the legacy `PUT` upsert is intentionally left to the still-live
//! Next.js route, so this handler returns `None` for every non-GET method).
//!
//! Legacy GET behavior:
//!   1. Requires an authenticated Supabase session (bearer or auth cookie;
//!      `ttr_app_*` app-session tokens are ignored). Missing/invalid session ->
//!      `401 { "error": "Unauthorized" }`.
//!   2. Normalizes the workspace id (`personal`/`internal`/handle aliases ->
//!      canonical UUID) and resolves the caller's effective workspace
//!      permissions (the `getPermissions` equivalent). When no permission
//!      context can be resolved -> `404 { "error": "Not found" }`.
//!   3. Parses the `ids` query param (comma-separated, trimmed, de-duplicated,
//!      empties dropped). When the resulting set is empty the route returns
//!      `200 {}` (an empty object).
//!   4. Authorizes the read. A caller with `manage_workspace_settings` may read
//!      any requested config ids. Lacking it -> `403 { "error": "Insufficient
//!      permissions to read workspace settings" }`.
//!   5. Reads `workspace_configs (id, value)` for the requested ids (excluding
//!      the synthetic `DATABASE_DEFAULT_INCLUDED_GROUPS` id) with the admin
//!      (service-role) client, and — when `DATABASE_DEFAULT_INCLUDED_GROUPS` is
//!      requested — reads `workspace_default_included_user_groups (group_id)`
//!      ordered by `created_at` ascending. Either read failing ->
//!      `500 { "error": "Failed to fetch workspace configs" }`.
//!   6. Success (`200`): an object keyed by each requested id. The
//!      `DATABASE_DEFAULT_INCLUDED_GROUPS` id maps to the comma-joined group ids
//!      (or `null` when none), and every other id maps to its stored config
//!      value (or `null` when absent).
//!
//! BEHAVIOR GAPS vs legacy:
//!   * The legacy route grants narrower read access to callers WITHOUT
//!     `manage_workspace_settings` when they request ONLY a homogeneous subset of
//!     configs they are otherwise entitled to:
//!       - report-render configs readable with `view_user_groups_reports`,
//!         `approve_reports`, or `manage_user_report_templates`;
//!       - invoice-creation defaults (`default_wallet_id`,
//!         `DEFAULT_SUBSCRIPTION_CATEGORY_ID`, `DEFAULT_CURRENCY`) readable with
//!         `create_invoices`;
//!       - profile-link defaults readable with `manage_user_profile_links`.
//!         Reproducing those alternate paths requires the caller's FULL permission
//!         set, which the shared `authorize_workspace_permission` helper does not
//!         surface (it checks a single permission). This handler therefore gates on
//!         `manage_workspace_settings` only; such narrow-permission callers receive
//!         `403` here instead of the legacy `200`. This is read-only, deny-side
//!         divergence for an uncommon caller shape (the settings UI reads these
//!         configs as a `manage_workspace_settings` holder).
//!   * The legacy route runs `verifyWorkspaceMembershipType` separately, yielding
//!     `403 { "error": "Workspace access denied" }` for a non-member and
//!     `500 { "error": "Failed to verify workspace membership" }` on a lookup
//!     failure. The shared helper folds membership into permission resolution, so
//!     a non-member collapses to `404 { "error": "Not found" }` here.
//!   * The legacy empty-`ids` `200 {}` short-circuit happens for any member with a
//!     permission context (before the settings-permission gate). Here it happens
//!     only after the `manage_workspace_settings` gate, so a member lacking that
//!     permission gets `403` instead of `200 {}` for an empty `ids` request.
//!   * Rate limiting, IP-block, suspension, and step-up challenges from the
//!     legacy middleware are not reproduced; the worker relies on its own edge
//!     protections. The authenticated read path is otherwise faithful.

use serde::Deserialize;
use serde_json::{Map, Value, json};
use std::collections::HashMap;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const CONFIGS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const CONFIGS_PATH_SUFFIX: &str = "/settings/configs";
const MANAGE_WORKSPACE_SETTINGS_PERMISSION: &str = "manage_workspace_settings";
const DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID: &str = "DATABASE_DEFAULT_INCLUDED_GROUPS";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const NOT_FOUND_MESSAGE: &str = "Not found";
const INSUFFICIENT_PERMISSIONS_MESSAGE: &str =
    "Insufficient permissions to read workspace settings";
const CONFIGS_FETCH_FAILED_MESSAGE: &str = "Failed to fetch workspace configs";
const INTERNAL_SERVER_ERROR_MESSAGE: &str = "Internal server error";

#[derive(Deserialize)]
struct ConfigRow {
    id: String,
    value: Option<String>,
}

#[derive(Deserialize)]
struct GroupRow {
    group_id: Option<String>,
}

pub(crate) async fn handle_workspaces_wsid_settings_configs_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = configs_ws_id(request.path)?;

    Some(match request.method {
        "GET" => configs_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

async fn configs_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    if !contact_data.configured() {
        return error_response(500, INTERNAL_SERVER_ERROR_MESSAGE);
    }

    // Authenticate, normalize the workspace id, and require
    // `manage_workspace_settings` (the common read path). See the module-level
    // doc comment for the narrower alternate-permission paths not reproduced.
    let ws_id = match authorize_workspace_permission(
        contact_data,
        request,
        raw_ws_id,
        MANAGE_WORKSPACE_SETTINGS_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization.ws_id,
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            return error_response(401, UNAUTHORIZED_MESSAGE);
        }
        Err(WorkspacePermissionAuthorizationError::NotFound) => {
            return error_response(404, NOT_FOUND_MESSAGE);
        }
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            return error_response(403, INSUFFICIENT_PERMISSIONS_MESSAGE);
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return error_response(500, INTERNAL_SERVER_ERROR_MESSAGE);
        }
    };

    let ids = parse_config_ids(request.url);
    if ids.is_empty() {
        return no_store_response(json_response(200, json!({})));
    }

    let should_resolve_default_included = ids
        .iter()
        .any(|id| id == DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID);
    let workspace_config_ids: Vec<String> = ids
        .iter()
        .filter(|id| id.as_str() != DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID)
        .cloned()
        .collect();

    let config_values =
        match fetch_workspace_configs(contact_data, outbound, &ws_id, &workspace_config_ids).await {
            Ok(values) => values,
            Err(()) => return error_response(500, CONFIGS_FETCH_FAILED_MESSAGE),
        };

    let included_groups = if should_resolve_default_included {
        match fetch_default_included_groups(contact_data, outbound, &ws_id).await {
            Ok(groups) => groups,
            Err(()) => return error_response(500, CONFIGS_FETCH_FAILED_MESSAGE),
        }
    } else {
        Vec::new()
    };

    no_store_response(json_response(
        200,
        build_result(&ids, &config_values, &included_groups),
    ))
}

async fn fetch_workspace_configs(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    config_ids: &[String],
) -> Result<HashMap<String, String>, ()> {
    // Legacy only queries `workspace_configs` when there is at least one
    // non-synthetic id to look up.
    if config_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let in_list = format!("in.({})", config_ids.join(","));
    let url = contact_data
        .rest_url(
            "workspace_configs",
            &[
                ("select", "id,value".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("id", in_list),
            ],
        )
        .ok_or(())?;

    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !is_success_status(response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<ConfigRow>>().map_err(|_| ())?;
    let mut map = HashMap::new();
    for row in rows {
        if let Some(value) = row.value {
            map.insert(row.id, value);
        }
    }

    Ok(map)
}

async fn fetch_default_included_groups(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<String>, ()> {
    let url = contact_data
        .rest_url(
            "workspace_default_included_user_groups",
            &[
                ("select", "group_id".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("order", "created_at.asc".to_owned()),
            ],
        )
        .ok_or(())?;

    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !is_success_status(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<GroupRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.group_id)
        .collect())
}

async fn send_service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    // Legacy reads with the admin (service-role) client, bypassing RLS; the read
    // is scoped purely by the `ws_id` filter.
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

// --- Pure helpers ---

fn configs_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(CONFIGS_PATH_PREFIX)?
        .strip_suffix(CONFIGS_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

/// Parse the `ids` query param: split on commas, trim each entry, drop empties,
/// and de-duplicate preserving first-occurrence order. Mirrors the legacy
/// `searchParams.get('ids')?.split(',').map(trim)` -> `new Set` -> `filter(Boolean)`.
fn parse_config_ids(request_url: Option<&str>) -> Vec<String> {
    let Some(raw) = request_url
        .and_then(|value| url::Url::parse(value).ok())
        .and_then(|parsed| {
            parsed
                .query_pairs()
                .find(|(key, _)| key == "ids")
                .map(|(_, value)| value.into_owned())
        })
    else {
        return Vec::new();
    };

    let mut ids: Vec<String> = Vec::new();
    for part in raw.split(',') {
        let trimmed = part.trim();
        if trimmed.is_empty() {
            continue;
        }
        if !ids.iter().any(|existing| existing == trimmed) {
            ids.push(trimmed.to_owned());
        }
    }

    ids
}

/// Build the success body: an object keyed by each requested id. The synthetic
/// `DATABASE_DEFAULT_INCLUDED_GROUPS` id maps to the comma-joined group ids (or
/// `null` when none); every other id maps to its stored value (or `null`).
fn build_result(
    ids: &[String],
    config_values: &HashMap<String, String>,
    included_groups: &[String],
) -> Value {
    let mut map = Map::new();

    for id in ids {
        if id == DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID {
            let value = if included_groups.is_empty() {
                Value::Null
            } else {
                Value::String(included_groups.join(","))
            };
            map.insert(id.clone(), value);
            continue;
        }

        let value = config_values
            .get(id)
            .map(|value| Value::String(value.clone()))
            .unwrap_or(Value::Null);
        map.insert(id.clone(), value);
    }

    Value::Object(map)
}

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_ws_id_from_matching_path() {
        assert_eq!(
            configs_ws_id("/api/v1/workspaces/abc/settings/configs"),
            Some("abc")
        );
        assert_eq!(
            configs_ws_id(
                "/api/v1/workspaces/11111111-1111-4111-8111-111111111111/settings/configs"
            ),
            Some("11111111-1111-4111-8111-111111111111")
        );
    }

    #[test]
    fn rejects_non_matching_paths() {
        // Wrong version prefix (no v1).
        assert_eq!(configs_ws_id("/api/workspaces/abc/settings/configs"), None);
        // Parent /settings route must not match this handler.
        assert_eq!(configs_ws_id("/api/v1/workspaces/abc/settings"), None);
        // Sub-routes under /settings/configs must not match.
        assert_eq!(
            configs_ws_id("/api/v1/workspaces/abc/settings/configs/extra"),
            None
        );
        // Empty workspace id.
        assert_eq!(configs_ws_id("/api/v1/workspaces//settings/configs"), None);
        // Extra path segments before /settings/configs.
        assert_eq!(
            configs_ws_id("/api/v1/workspaces/abc/extra/settings/configs"),
            None
        );
        // Missing suffix.
        assert_eq!(configs_ws_id("/api/v1/workspaces/abc"), None);
    }

    #[test]
    fn parses_ids_trimming_deduping_and_dropping_empties() {
        assert_eq!(
            parse_config_ids(Some(
                "https://x.localhost/api/v1/workspaces/w/settings/configs?ids=%20BRAND_NAME%20,REPORT_INTRO,,BRAND_NAME"
            )),
            vec!["BRAND_NAME".to_owned(), "REPORT_INTRO".to_owned()]
        );
    }

    #[test]
    fn parses_empty_ids_as_no_entries() {
        // Missing `ids` param.
        assert!(
            parse_config_ids(Some(
                "https://x.localhost/api/v1/workspaces/w/settings/configs"
            ))
            .is_empty()
        );
        // Present but blank `ids` param.
        assert!(
            parse_config_ids(Some(
                "https://x.localhost/api/v1/workspaces/w/settings/configs?ids="
            ))
            .is_empty()
        );
        // Only separators / whitespace.
        assert!(
            parse_config_ids(Some(
                "https://x.localhost/api/v1/workspaces/w/settings/configs?ids=%20,%20,"
            ))
            .is_empty()
        );
        // Unparseable URL.
        assert!(parse_config_ids(Some("not a url")).is_empty());
        assert!(parse_config_ids(None).is_empty());
    }

    #[test]
    fn build_result_maps_config_values_and_null_for_missing() {
        let ids = vec!["BRAND_NAME".to_owned(), "REPORT_INTRO".to_owned()];
        let mut values = HashMap::new();
        values.insert("BRAND_NAME".to_owned(), "Acme".to_owned());

        assert_eq!(
            build_result(&ids, &values, &[]),
            json!({ "BRAND_NAME": "Acme", "REPORT_INTRO": null })
        );
    }

    #[test]
    fn build_result_joins_default_included_groups() {
        let ids = vec![DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID.to_owned()];
        let values = HashMap::new();
        let groups = vec!["g1".to_owned(), "g2".to_owned()];

        assert_eq!(
            build_result(&ids, &values, &groups),
            json!({ "DATABASE_DEFAULT_INCLUDED_GROUPS": "g1,g2" })
        );
    }

    #[test]
    fn build_result_uses_null_for_empty_default_included_groups() {
        let ids = vec![DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID.to_owned()];
        let values = HashMap::new();

        assert_eq!(
            build_result(&ids, &values, &[]),
            json!({ "DATABASE_DEFAULT_INCLUDED_GROUPS": null })
        );
    }

    #[test]
    fn build_result_mixes_groups_and_config_values() {
        let ids = vec![
            DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID.to_owned(),
            "DEFAULT_CURRENCY".to_owned(),
        ];
        let mut values = HashMap::new();
        values.insert("DEFAULT_CURRENCY".to_owned(), "USD".to_owned());
        let groups = vec!["g1".to_owned()];

        assert_eq!(
            build_result(&ids, &values, &groups),
            json!({ "DATABASE_DEFAULT_INCLUDED_GROUPS": "g1", "DEFAULT_CURRENCY": "USD" })
        );
    }
}
