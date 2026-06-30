//! Handler for `GET /api/v1/infrastructure/rate-limit-appeals`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/infrastructure/rate-limit-appeals/route.ts`.
//!
//! Auth mirrors `authorizeAbuseIntelligenceRequest`: the caller must hold the
//! `view_infrastructure` permission on the root workspace
//! (`00000000-0000-0000-0000-000000000000`). Status codes:
//!   * missing/invalid session            -> `401 { "message": "Unauthorized" }`
//!   * authenticated but lacking the perm -> `403 { "message": "Forbidden" }`
//!   * invalid query parameters           -> `400 { "message": "Invalid query parameters", "errors": [] }`
//!   * upstream read / config failure     -> `500 { "message": "Failed to load rate-limit appeals" }`
//!
//! On success it reads `rate_limit_appeals` with the service-role (admin)
//! client (RLS bypassed, exactly like the legacy `createAdminClient`), enriches
//! each appeal with workspace/user/blocked-IP/membership context (porting
//! `enrichRateLimitAppeals` from `@/lib/rate-limits/subject-resolution`),
//! applies the optional `q` substring filter, and returns
//! `{ appeals, summary }`. Enrichment lookups swallow errors (empty maps),
//! matching the legacy try/catch helpers.
//!
//! BEHAVIOR GAPS vs legacy (intentional, low-risk):
//!   * The `400` body's `errors` field is an empty array rather than the exact
//!     Zod issue list (the worker has no Zod runtime); the `message` matches.
//!   * `limit` coercion uses Rust `f64` parsing in place of JS `Number()`, so
//!     exotic inputs (hex `0x..`, `Infinity`, digit separators) may differ;
//!     ordinary integer inputs behave identically.
//!   * The `q` length check counts Unicode scalar values rather than UTF-16
//!     code units (only differs for astral-plane characters past the limit).

use std::collections::{HashMap, HashSet};

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    infrastructure_root_auth::ROOT_WORKSPACE_ID,
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const RATE_LIMIT_APPEALS_PATH: &str = "/api/v1/infrastructure/rate-limit-appeals";
const VIEW_INFRASTRUCTURE_PERMISSION: &str = "view_infrastructure";
const APPEALS_TABLE: &str = "rate_limit_appeals";
const LOAD_ERROR_MESSAGE: &str = "Failed to load rate-limit appeals";
const INVALID_QUERY_MESSAGE: &str = "Invalid query parameters";
const MAX_SEARCH_LENGTH: usize = 500;
const DEFAULT_LIMIT: i64 = 100;
const MAX_LIMIT: i64 = 500;
const APPEAL_STATUS_FILTERS: [&str; 5] = ["approved", "closed", "pending", "rejected", "all"];

pub(crate) async fn handle_infrastructure_rate_limit_appeals_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != RATE_LIMIT_APPEALS_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => appeals_response(config, request, outbound).await,
        _ => return None,
    })
}

async fn appeals_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    match authorize_workspace_permission(
        &config.contact_data,
        request,
        ROOT_WORKSPACE_ID,
        VIEW_INFRASTRUCTURE_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(_) => {}
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            return message_response(401, "Unauthorized");
        }
        Err(
            WorkspacePermissionAuthorizationError::Forbidden
            | WorkspacePermissionAuthorizationError::NotFound,
        ) => {
            return message_response(403, "Forbidden");
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return load_error_response();
        }
    }

    let query = match parse_query(request.url) {
        Ok(query) => query,
        Err(()) => return invalid_query_response(),
    };

    let contact_data = &config.contact_data;
    let Some(service_role_key) = contact_data.service_role_key() else {
        return load_error_response();
    };

    let appeals = match fetch_appeals(contact_data, outbound, service_role_key, &query).await {
        Some(appeals) => appeals,
        None => return load_error_response(),
    };

    let enriched = enrich_appeals(contact_data, outbound, service_role_key, appeals).await;
    let filtered = filter_appeals(enriched, query.q.as_deref());
    let summary = build_summary(&filtered);

    no_store_response(json_response(
        200,
        json!({ "appeals": filtered, "summary": summary }),
    ))
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct AppealsQuery {
    limit: i64,
    q: Option<String>,
    status: String,
}

fn parse_query(request_url: Option<&str>) -> Result<AppealsQuery, ()> {
    let url = request_url.and_then(|request_url| url::Url::parse(request_url).ok());
    let raw = |key: &str| url.as_ref().and_then(|url| first_query_value(url, key));

    Ok(AppealsQuery {
        limit: parse_limit(raw("limit").as_deref())?,
        q: parse_search(raw("q").as_deref())?,
        status: parse_status(raw("status").as_deref())?,
    })
}

fn first_query_value(url: &url::Url, expected_key: &str) -> Option<String> {
    url.query_pairs()
        .find_map(|(key, value)| (key == expected_key).then(|| value.into_owned()))
}

// Mirrors `z.coerce.number().int().positive().max(500).default(100)`.
fn parse_limit(raw: Option<&str>) -> Result<i64, ()> {
    let Some(raw) = raw else {
        return Ok(DEFAULT_LIMIT);
    };
    let trimmed = raw.trim();
    // JS `Number('')` and `Number(' ')` both coerce to 0 (which then fails the
    // `.positive()` check).
    let value = if trimmed.is_empty() {
        0.0
    } else {
        trimmed.parse::<f64>().map_err(|_| ())?
    };

    if !value.is_finite() || value.fract() != 0.0 || value <= 0.0 || value > MAX_LIMIT as f64 {
        return Err(());
    }

    Ok(value as i64)
}

// Mirrors `z.enum([...statuses, 'all']).default('pending')`.
fn parse_status(raw: Option<&str>) -> Result<String, ()> {
    let Some(raw) = raw else {
        return Ok("pending".to_owned());
    };

    if APPEAL_STATUS_FILTERS.contains(&raw) {
        Ok(raw.to_owned())
    } else {
        Err(())
    }
}

// Mirrors `z.string().trim().max(MAX_SEARCH_LENGTH).optional()`. An empty (or
// whitespace-only) value is treated as "no search", matching the legacy
// `normalizedSearch ? ... : enrichedAppeals` falsy guard.
fn parse_search(raw: Option<&str>) -> Result<Option<String>, ()> {
    let Some(raw) = raw else {
        return Ok(None);
    };
    let trimmed = raw.trim();
    if trimmed.chars().count() > MAX_SEARCH_LENGTH {
        return Err(());
    }
    if trimmed.is_empty() {
        Ok(None)
    } else {
        Ok(Some(trimmed.to_owned()))
    }
}

async fn fetch_appeals(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    service_role_key: &str,
    query: &AppealsQuery,
) -> Option<Vec<Value>> {
    let mut params = vec![
        ("select", "*".to_owned()),
        ("order", "created_at.desc".to_owned()),
        ("limit", query.limit.to_string()),
    ];
    if query.status != "all" {
        params.push(("status", format!("eq.{}", query.status)));
    }

    fetch_rows(
        contact_data,
        outbound,
        service_role_key,
        APPEALS_TABLE,
        &params,
    )
    .await
}

async fn enrich_appeals(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    service_role_key: &str,
    appeals: Vec<Value>,
) -> Vec<Value> {
    let workspace_ids = unique_field(&appeals, "workspace_id");
    let user_ids = unique_field(&appeals, "creator_id");
    let ips = unique_field(&appeals, "client_ip");

    let workspaces =
        load_workspace_map(contact_data, outbound, service_role_key, &workspace_ids).await;
    let users = load_user_map(contact_data, outbound, service_role_key, &user_ids).await;
    let blocks = load_blocked_ip_map(contact_data, outbound, service_role_key, &ips).await;
    let memberships = load_membership_map(
        contact_data,
        outbound,
        service_role_key,
        &workspace_ids,
        &user_ids,
    )
    .await;

    appeals
        .into_iter()
        .map(|appeal| enrich_one(appeal, &workspaces, &users, &blocks, &memberships))
        .collect()
}

fn enrich_one(
    appeal: Value,
    workspaces: &HashMap<String, Value>,
    users: &HashMap<String, Value>,
    blocks: &HashMap<String, String>,
    memberships: &HashMap<String, Value>,
) -> Value {
    let workspace_id = non_empty_str(&appeal, "workspace_id");
    let creator_id = non_empty_str(&appeal, "creator_id");
    let client_ip = non_empty_str(&appeal, "client_ip");

    let workspace = workspace_id
        .and_then(|id| workspaces.get(id))
        .cloned()
        .unwrap_or(Value::Null);
    let requester = creator_id
        .and_then(|id| users.get(id))
        .cloned()
        .unwrap_or_else(|| {
            json!({
                "avatarUrl": Value::Null,
                "displayName": Value::Null,
                "email": opt(&appeal, "user_email"),
                "handle": Value::Null,
                "id": opt(&appeal, "creator_id"),
            })
        });

    let membership = match (workspace_id, creator_id) {
        (Some(ws), Some(user)) => memberships.get(&format!("{ws}:{user}")),
        _ => None,
    };
    let membership_verified = membership.is_some();
    let membership_type = membership.and_then(|membership| membership.as_str());
    let active_block_id = client_ip.and_then(|ip| blocks.get(ip)).cloned();
    let active = active_block_id.is_some();
    let has_workspace = !workspace.is_null();

    let membership_label = if workspace_id.is_none() {
        "No workspace captured".to_owned()
    } else if membership_verified {
        format!("Requester is a {}", membership_type.unwrap_or("member"))
    } else {
        "Requester is not verified in this workspace".to_owned()
    };
    let membership_status = if workspace_id.is_none() {
        "not_applicable"
    } else if membership_verified {
        "member"
    } else {
        "not_member"
    };

    let review_context = json!({
        "activeBlock": {
            "active": active,
            "blockedIpId": active_block_id.map(Value::String).unwrap_or(Value::Null),
            "label": if active { "Active IP block found" } else { "No active IP block" },
        },
        "membership": {
            "label": membership_label,
            "status": membership_status,
            "type": membership.cloned().unwrap_or(Value::Null),
            "verified": membership_verified,
        },
        "recommendedActions": build_recommended_actions(active, has_workspace, membership_verified),
        "requester": requester,
        "workspace": workspace,
    });

    let mut object = appeal.as_object().cloned().unwrap_or_default();
    object.insert("reviewContext".to_owned(), review_context);
    Value::Object(object)
}

fn build_recommended_actions(
    active_block: bool,
    has_workspace: bool,
    membership_verified: bool,
) -> Value {
    let disabled_reason = if !has_workspace {
        Value::String("No workspace was captured with this appeal.".to_owned())
    } else if !membership_verified {
        Value::String("Requester is not verified as a member of this workspace.".to_owned())
    } else {
        Value::Null
    };
    let requires_advanced_override = !disabled_reason.is_null();

    json!([
        {
            "createWorkspaceRule": true,
            "description": "Clear the IP block and give this workspace 3x limits for 30 days.",
            "disabledReason": disabled_reason.clone(),
            "expiresInDays": 30,
            "key": "trusted_workspace",
            "label": "Approve trusted workspace",
            "recommended": has_workspace && membership_verified,
            "requiresAdvancedOverride": requires_advanced_override,
            "trustMultiplier": 3,
        },
        {
            "createWorkspaceRule": true,
            "description": "Short event/classroom uplift: 5x limits for 7 days.",
            "disabledReason": disabled_reason.clone(),
            "expiresInDays": 7,
            "key": "event_or_classroom",
            "label": "Short event or classroom",
            "recommended": false,
            "requiresAdvancedOverride": requires_advanced_override,
            "trustMultiplier": 5,
        },
        {
            "createWorkspaceRule": true,
            "description": "Extended trusted workspace: 10x limits for 30 days.",
            "disabledReason": disabled_reason,
            "expiresInDays": 30,
            "key": "extended_trusted",
            "label": "Extended trusted workspace",
            "recommended": false,
            "requiresAdvancedOverride": requires_advanced_override,
            "trustMultiplier": 10,
        },
        {
            "createWorkspaceRule": false,
            "description": if active_block {
                "Clear the active IP block without changing rate limits."
            } else {
                "Close as approved without a workspace uplift."
            },
            "disabledReason": Value::Null,
            "expiresInDays": Value::Null,
            "key": "clear_ip_only",
            "label": "Clear IP only",
            "recommended": active_block && !membership_verified,
            "requiresAdvancedOverride": false,
            "trustMultiplier": Value::Null,
        },
    ])
}

fn filter_appeals(appeals: Vec<Value>, q: Option<&str>) -> Vec<Value> {
    let Some(q) = q else {
        return appeals;
    };
    let needle = q.to_lowercase();

    appeals
        .into_iter()
        .filter(|appeal| {
            [
                appeal.get("client_ip"),
                appeal.get("creator_id"),
                appeal.get("user_email"),
                appeal.get("workspace_id"),
                appeal.get("request_path"),
                appeal.pointer("/reviewContext/requester/displayName"),
                appeal.pointer("/reviewContext/requester/email"),
                appeal.pointer("/reviewContext/workspace/name"),
                appeal.pointer("/reviewContext/workspace/handle"),
            ]
            .into_iter()
            .filter_map(|value| value.and_then(Value::as_str))
            .filter(|value| !value.is_empty())
            .any(|value| value.to_lowercase().contains(&needle))
        })
        .collect()
}

fn build_summary(appeals: &[Value]) -> Value {
    let mut approved = 0i64;
    let mut closed = 0i64;
    let mut pending = 0i64;
    let mut rejected = 0i64;

    for appeal in appeals {
        match appeal.get("status").and_then(Value::as_str) {
            Some("approved") => approved += 1,
            Some("closed") => closed += 1,
            Some("pending") => pending += 1,
            Some("rejected") => rejected += 1,
            _ => {}
        }
    }

    json!({
        "approved": approved,
        "closed": closed,
        "pending": pending,
        "rejected": rejected,
        "total": appeals.len(),
    })
}

async fn load_workspace_map(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    service_role_key: &str,
    ids: &[String],
) -> HashMap<String, Value> {
    if ids.is_empty() {
        return HashMap::new();
    }
    let params = [
        ("select", "id,name,handle,avatar_url,personal".to_owned()),
        ("id", format!("in.({})", ids.join(","))),
    ];
    let Some(rows) = fetch_rows(
        contact_data,
        outbound,
        service_role_key,
        "workspaces",
        &params,
    )
    .await
    else {
        return HashMap::new();
    };

    rows.into_iter()
        .filter_map(|row| {
            let id = row.get("id")?.as_str()?.to_owned();
            let summary = json!({
                "avatarUrl": opt(&row, "avatar_url"),
                "handle": opt(&row, "handle"),
                "id": id.clone(),
                "name": opt(&row, "name"),
                "personal": opt(&row, "personal"),
            });
            Some((id, summary))
        })
        .collect()
}

async fn load_user_map(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    service_role_key: &str,
    ids: &[String],
) -> HashMap<String, Value> {
    if ids.is_empty() {
        return HashMap::new();
    }
    let filter = format!("in.({})", ids.join(","));

    let private_params = [
        ("select", "user_id,email,full_name".to_owned()),
        ("user_id", filter.clone()),
    ];
    let private_by_id: HashMap<String, Value> = fetch_rows(
        contact_data,
        outbound,
        service_role_key,
        "user_private_details",
        &private_params,
    )
    .await
    .unwrap_or_default()
    .into_iter()
    .filter_map(|row| Some((row.get("user_id")?.as_str()?.to_owned(), row)))
    .collect();

    let user_params = [
        ("select", "id,display_name,handle,avatar_url".to_owned()),
        ("id", filter),
    ];
    let Some(rows) = fetch_rows(
        contact_data,
        outbound,
        service_role_key,
        "users",
        &user_params,
    )
    .await
    else {
        return HashMap::new();
    };

    rows.into_iter()
        .filter_map(|row| {
            let id = row.get("id")?.as_str()?.to_owned();
            let private_row = private_by_id.get(&id);
            let display_name = clean_field(&row, "display_name").or_else(|| {
                private_row.and_then(|private_row| clean_field(private_row, "full_name"))
            });
            let email = private_row
                .and_then(|private_row| private_row.get("email").cloned())
                .unwrap_or(Value::Null);

            let summary = json!({
                "avatarUrl": opt(&row, "avatar_url"),
                "displayName": display_name.map(Value::String).unwrap_or(Value::Null),
                "email": email,
                "handle": opt(&row, "handle"),
                "id": id.clone(),
            });
            Some((id, summary))
        })
        .collect()
}

async fn load_blocked_ip_map(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    service_role_key: &str,
    ips: &[String],
) -> HashMap<String, String> {
    if ips.is_empty() {
        return HashMap::new();
    }
    let params = [
        ("select", "id,ip_address".to_owned()),
        ("ip_address", format!("in.({})", ips.join(","))),
        ("status", "eq.active".to_owned()),
    ];
    let Some(rows) = fetch_rows(
        contact_data,
        outbound,
        service_role_key,
        "blocked_ips",
        &params,
    )
    .await
    else {
        return HashMap::new();
    };

    rows.into_iter()
        .filter_map(|row| {
            let ip = row.get("ip_address")?.as_str()?.to_owned();
            let id = row.get("id")?.as_str()?.to_owned();
            Some((ip, id))
        })
        .collect()
}

async fn load_membership_map(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    service_role_key: &str,
    workspace_ids: &[String],
    user_ids: &[String],
) -> HashMap<String, Value> {
    if workspace_ids.is_empty() || user_ids.is_empty() {
        return HashMap::new();
    }
    let params = [
        ("select", "ws_id,user_id,type".to_owned()),
        ("ws_id", format!("in.({})", workspace_ids.join(","))),
        ("user_id", format!("in.({})", user_ids.join(","))),
    ];
    let Some(rows) = fetch_rows(
        contact_data,
        outbound,
        service_role_key,
        "workspace_members",
        &params,
    )
    .await
    else {
        return HashMap::new();
    };

    rows.into_iter()
        .filter_map(|row| {
            let ws_id = row.get("ws_id")?.as_str()?;
            let user_id = row.get("user_id")?.as_str()?;
            let key = format!("{ws_id}:{user_id}");
            Some((key, row.get("type").cloned().unwrap_or(Value::Null)))
        })
        .collect()
}

async fn fetch_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    service_role_key: &str,
    table: &str,
    params: &[(&str, String)],
) -> Option<Vec<Value>> {
    let url = contact_data.rest_url(table, params)?;
    let response = service_role_get(outbound, &url, service_role_key)
        .await
        .ok()?;
    if !(200..300).contains(&response.status) {
        return None;
    }
    response.json::<Vec<Value>>().ok()
}

async fn service_role_get(
    outbound: &impl OutboundHttpClient,
    url: &str,
    service_role_key: &str,
) -> Result<OutboundResponse, ()> {
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

fn unique_field(appeals: &[Value], field: &str) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for appeal in appeals {
        if let Some(value) = appeal.get(field).and_then(Value::as_str) {
            let trimmed = value.trim();
            if !trimmed.is_empty() && seen.insert(trimmed.to_owned()) {
                out.push(trimmed.to_owned());
            }
        }
    }
    out
}

fn non_empty_str<'a>(value: &'a Value, field: &str) -> Option<&'a str> {
    value
        .get(field)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
}

fn clean_field(value: &Value, field: &str) -> Option<String> {
    value
        .get(field)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn opt(value: &Value, field: &str) -> Value {
    value.get(field).cloned().unwrap_or(Value::Null)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

fn invalid_query_response() -> BackendResponse {
    no_store_response(json_response(
        400,
        json!({ "errors": [], "message": INVALID_QUERY_MESSAGE }),
    ))
}

fn load_error_response() -> BackendResponse {
    message_response(500, LOAD_ERROR_MESSAGE)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_guard_only_matches_exact_mount_path() {
        assert_eq!(
            RATE_LIMIT_APPEALS_PATH,
            "/api/v1/infrastructure/rate-limit-appeals"
        );
    }

    #[test]
    fn parse_query_defaults_when_no_url() {
        let query = parse_query(None).expect("defaults");
        assert_eq!(query.limit, 100);
        assert_eq!(query.status, "pending");
        assert_eq!(query.q, None);
    }

    #[test]
    fn parse_query_reads_values() {
        let query = parse_query(Some(
            "https://backend.test/api/v1/infrastructure/rate-limit-appeals?limit=25&status=all&q=%20Foo%20",
        ))
        .expect("parsed");
        assert_eq!(query.limit, 25);
        assert_eq!(query.status, "all");
        assert_eq!(query.q.as_deref(), Some("Foo"));
    }

    #[test]
    fn parse_limit_matches_zod_rules() {
        assert_eq!(parse_limit(None), Ok(100));
        assert_eq!(parse_limit(Some("1")), Ok(1));
        assert_eq!(parse_limit(Some("500")), Ok(500));
        assert_eq!(parse_limit(Some("501")), Err(()));
        assert_eq!(parse_limit(Some("0")), Err(()));
        assert_eq!(parse_limit(Some("-5")), Err(()));
        assert_eq!(parse_limit(Some("10.5")), Err(()));
        assert_eq!(parse_limit(Some("abc")), Err(()));
        assert_eq!(parse_limit(Some("")), Err(()));
    }

    #[test]
    fn parse_status_validates_enum() {
        assert_eq!(parse_status(None), Ok("pending".to_owned()));
        assert_eq!(parse_status(Some("approved")), Ok("approved".to_owned()));
        assert_eq!(parse_status(Some("all")), Ok("all".to_owned()));
        assert_eq!(parse_status(Some("nope")), Err(()));
        assert_eq!(parse_status(Some("Approved")), Err(()));
    }

    #[test]
    fn parse_search_trims_and_limits() {
        assert_eq!(parse_search(None), Ok(None));
        assert_eq!(parse_search(Some("   ")), Ok(None));
        assert_eq!(parse_search(Some("  hi  ")), Ok(Some("hi".to_owned())));
        let too_long = "x".repeat(MAX_SEARCH_LENGTH + 1);
        assert_eq!(parse_search(Some(&too_long)), Err(()));
        let at_limit = "x".repeat(MAX_SEARCH_LENGTH);
        assert_eq!(parse_search(Some(&at_limit)), Ok(Some(at_limit)));
    }

    #[test]
    fn unique_field_trims_dedupes_and_drops_empty() {
        let appeals = vec![
            json!({ "creator_id": " a " }),
            json!({ "creator_id": "a" }),
            json!({ "creator_id": "" }),
            json!({ "creator_id": "b" }),
            json!({}),
        ];
        assert_eq!(unique_field(&appeals, "creator_id"), vec!["a", "b"]);
    }

    #[test]
    fn build_summary_counts_known_statuses() {
        let appeals = vec![
            json!({ "status": "approved" }),
            json!({ "status": "pending" }),
            json!({ "status": "pending" }),
            json!({ "status": "weird" }),
        ];
        let summary = build_summary(&appeals);
        assert_eq!(summary["approved"], 1);
        assert_eq!(summary["pending"], 2);
        assert_eq!(summary["closed"], 0);
        assert_eq!(summary["rejected"], 0);
        assert_eq!(summary["total"], 4);
    }

    #[test]
    fn filter_appeals_returns_all_when_no_search() {
        let appeals = vec![json!({ "client_ip": "1.2.3.4" })];
        assert_eq!(filter_appeals(appeals.clone(), None).len(), 1);
    }

    #[test]
    fn filter_appeals_matches_across_fields_case_insensitively() {
        let appeals = vec![
            json!({ "client_ip": "10.0.0.1", "status": "pending" }),
            json!({
                "client_ip": "9.9.9.9",
                "reviewContext": { "workspace": { "name": "Acme Corp" } }
            }),
            json!({ "client_ip": "8.8.8.8" }),
        ];
        let matched = filter_appeals(appeals, Some("acme"));
        assert_eq!(matched.len(), 1);
        assert_eq!(matched[0]["client_ip"], "9.9.9.9");
    }

    #[test]
    fn build_recommended_actions_disables_without_workspace() {
        let actions = build_recommended_actions(false, false, false);
        assert_eq!(
            actions[0]["disabledReason"],
            "No workspace was captured with this appeal."
        );
        assert_eq!(actions[0]["requiresAdvancedOverride"], true);
        assert_eq!(actions[0]["recommended"], false);
        // "Clear IP only" is never disabled.
        assert_eq!(actions[3]["disabledReason"], Value::Null);
        assert_eq!(actions[3]["requiresAdvancedOverride"], false);
    }

    #[test]
    fn build_recommended_actions_recommends_trusted_workspace_for_verified_member() {
        let actions = build_recommended_actions(true, true, true);
        assert_eq!(actions[0]["disabledReason"], Value::Null);
        assert_eq!(actions[0]["recommended"], true);
        assert_eq!(actions[0]["requiresAdvancedOverride"], false);
        // Active block but verified member -> clear-IP-only not recommended.
        assert_eq!(actions[3]["recommended"], false);
        assert_eq!(
            actions[3]["description"],
            "Clear the active IP block without changing rate limits."
        );
    }

    #[test]
    fn enrich_one_builds_review_context_with_fallback_requester() {
        let appeal = json!({
            "id": "appeal-1",
            "client_ip": "1.1.1.1",
            "creator_id": "user-1",
            "user_email": "fallback@example.com",
            "status": "pending"
        });
        let workspaces = HashMap::new();
        let users = HashMap::new();
        let blocks = HashMap::new();
        let memberships = HashMap::new();

        let enriched = enrich_one(appeal, &workspaces, &users, &blocks, &memberships);
        assert_eq!(enriched["id"], "appeal-1");
        let context = &enriched["reviewContext"];
        assert_eq!(context["workspace"], Value::Null);
        assert_eq!(context["requester"]["email"], "fallback@example.com");
        assert_eq!(context["requester"]["id"], "user-1");
        assert_eq!(context["activeBlock"]["active"], false);
        assert_eq!(context["activeBlock"]["label"], "No active IP block");
        assert_eq!(context["membership"]["status"], "not_applicable");
        assert_eq!(context["membership"]["verified"], false);
    }

    #[test]
    fn enrich_one_resolves_workspace_membership_and_block() {
        let appeal = json!({
            "id": "appeal-2",
            "client_ip": "2.2.2.2",
            "creator_id": "user-2",
            "workspace_id": "ws-2",
            "status": "approved"
        });
        let mut workspaces = HashMap::new();
        workspaces.insert("ws-2".to_owned(), json!({ "id": "ws-2", "name": "Beta" }));
        let mut users = HashMap::new();
        users.insert(
            "user-2".to_owned(),
            json!({ "id": "user-2", "displayName": "Real User", "email": "real@example.com" }),
        );
        let mut blocks = HashMap::new();
        blocks.insert("2.2.2.2".to_owned(), "block-9".to_owned());
        let mut memberships = HashMap::new();
        memberships.insert("ws-2:user-2".to_owned(), Value::String("OWNER".to_owned()));

        let enriched = enrich_one(appeal, &workspaces, &users, &blocks, &memberships);
        let context = &enriched["reviewContext"];
        assert_eq!(context["workspace"]["name"], "Beta");
        assert_eq!(context["requester"]["displayName"], "Real User");
        assert_eq!(context["activeBlock"]["active"], true);
        assert_eq!(context["activeBlock"]["blockedIpId"], "block-9");
        assert_eq!(context["activeBlock"]["label"], "Active IP block found");
        assert_eq!(context["membership"]["status"], "member");
        assert_eq!(context["membership"]["verified"], true);
        assert_eq!(context["membership"]["type"], "OWNER");
        assert_eq!(context["membership"]["label"], "Requester is a OWNER");
    }
}
