//! Handler for `GET /api/v1/infrastructure/entity-creation-limits`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/infrastructure/entity-creation-limits/route.ts`.
//!
//! The legacy GET handler:
//!   1. calls `enforceRootWorkspaceAdmin(ROOT_WORKSPACE_ID)` to require an
//!      authenticated caller who is a member of the root workspace;
//!   2. reads every row from `platform_entity_creation_limits` ordered by
//!      `table_name` ascending, then `tier` ascending, with the admin
//!      (service-role) client;
//!   3. calls the `get_available_platform_entity_limit_tables` RPC (admin /
//!      service-role) for the list of available tables; and
//!   4. responds with `{ availableTables, tableGroups: buildTableGroups(rows) }`.
//!
//! `buildTableGroups` groups the limit rows by `table_name`, sorts the groups
//! by table name, sets `metadata` to the first row of each group, and exposes a
//! `tiers` array reordered into the canonical tier order
//! (`FREE, PLUS, PRO, ENTERPRISE`) with absent tiers omitted. This handler
//! reproduces that shaping exactly while preserving every row field verbatim.
//!
//! BEHAVIOR GAPS:
//!   * The legacy `enforceRootWorkspaceAdmin` membership check reads
//!     `workspace_members.type` (requiring a `MEMBER` row in the root
//!     workspace). The shared `authorize_root_workspace_read_access` helper
//!     instead verifies root-workspace membership via
//!     `workspace_user_linked_users`. Both gate access to authenticated root
//!     workspace members; the underlying table differs.
//!   * The legacy reads use the service-role (admin) client, so RLS is
//!     bypassed. This handler mirrors that by reading with the service-role key
//!     after the root-membership check, rather than forwarding the caller token.
//!   * `buildTableGroups` sorts table names with JavaScript `localeCompare`;
//!     this handler uses Rust's lexicographic ordering. Because the source
//!     query already orders by `table_name` ascending, the resulting group
//!     order matches for the ASCII table identifiers used here.

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    infrastructure_root_auth::{RootWorkspaceReadAuthError, authorize_root_workspace_read_access},
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

pub(crate) const ENTITY_CREATION_LIMITS_PATH: &str =
    "/api/v1/infrastructure/entity-creation-limits";

const LIMITS_TABLE: &str = "platform_entity_creation_limits";
const AVAILABLE_TABLES_RPC: &str = "get_available_platform_entity_limit_tables";
const ERROR_MESSAGE: &str = "Error fetching entity creation limits";

/// Canonical tier ordering mirrored from the legacy `TIER_ORDER` constant.
const TIER_ORDER: [&str; 4] = ["FREE", "PLUS", "PRO", "ENTERPRISE"];

pub(crate) async fn handle_infrastructure_entity_creation_limits_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if !matches_path(request.path) {
        return None;
    }

    Some(match request.method {
        "GET" => entity_creation_limits_response(config, request, outbound).await,
        _ => return None,
    })
}

async fn entity_creation_limits_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // The root-membership check gates access; the reads below use the
    // service-role key (mirroring the legacy admin client), so the caller's
    // access token is intentionally not forwarded.
    match authorize_root_workspace_read_access(config, request, outbound).await {
        Ok(_access) => {}
        Err(RootWorkspaceReadAuthError::Unauthorized) => {
            return no_store_response(json_response(401, json!({ "message": "Unauthorized" })));
        }
        Err(RootWorkspaceReadAuthError::Forbidden) => {
            return no_store_response(json_response(403, json!({ "message": "Forbidden" })));
        }
    }

    let contact_data = &config.contact_data;
    if !contact_data.configured() {
        return error_response();
    }

    let rows = match fetch_limit_rows(contact_data, outbound).await {
        Ok(rows) => rows,
        Err(()) => return error_response(),
    };
    let available_tables = match fetch_available_tables(contact_data, outbound).await {
        Ok(available_tables) => available_tables,
        Err(()) => return error_response(),
    };

    no_store_response(json_response(
        200,
        json!({
            "availableTables": available_tables,
            "tableGroups": build_table_groups(rows),
        }),
    ))
}

async fn fetch_limit_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
) -> Result<Vec<Value>, ()> {
    // The legacy route reads with the admin (service-role) client and orders by
    // `table_name` ascending, then `tier` ascending.
    let url = contact_data
        .rest_url(
            LIMITS_TABLE,
            &[
                ("select", "*".to_owned()),
                ("order", "table_name.asc,tier.asc".to_owned()),
            ],
        )
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !is_success_status(response.status) {
        return Err(());
    }

    response.json::<Vec<Value>>().map_err(|_| ())
}

async fn fetch_available_tables(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
) -> Result<Vec<Value>, ()> {
    // The legacy route invokes the RPC with the admin (service-role) client and
    // no arguments; PostgREST RPC calls are POST requests.
    let url = contact_data.rpc_url(AVAILABLE_TABLES_RPC).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body("{}"),
        )
        .await
        .map_err(|_| ())?;

    if !is_success_status(response.status) {
        return Err(());
    }

    response.json::<Vec<Value>>().map_err(|_| ())
}

/// Mirrors the legacy `buildTableGroups`: group limit rows by `table_name`,
/// order the groups by table name, set `metadata` to the first row of each
/// group, and expose `tiers` reordered into `TIER_ORDER` with absent tiers
/// omitted. Row objects are preserved verbatim.
fn build_table_groups(rows: Vec<Value>) -> Vec<Value> {
    // Preserve first-seen order of distinct table names while collecting rows.
    let mut order: Vec<String> = Vec::new();
    let mut groups: std::collections::HashMap<String, Vec<Value>> =
        std::collections::HashMap::new();

    for row in rows {
        let table_name = row
            .get("table_name")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned();
        if !groups.contains_key(&table_name) {
            order.push(table_name.clone());
        }
        groups.entry(table_name).or_default().push(row);
    }

    // The legacy implementation sorts the grouped entries by table name.
    order.sort();

    order
        .into_iter()
        .filter_map(|table_name| {
            let group_rows = groups.remove(&table_name)?;
            let metadata = group_rows.first()?.clone();

            let tiers: Vec<Value> = TIER_ORDER
                .iter()
                .filter_map(|tier| {
                    group_rows
                        .iter()
                        .find(|row| row.get("tier").and_then(Value::as_str) == Some(*tier))
                        .cloned()
                })
                .collect();

            Some(json!({
                "tableName": table_name,
                "metadata": metadata,
                "tiers": tiers,
            }))
        })
        .collect()
}

fn matches_path(path: &str) -> bool {
    path == ENTITY_CREATION_LIMITS_PATH
}

fn error_response() -> BackendResponse {
    no_store_response(json_response(500, json!({ "message": ERROR_MESSAGE })))
}

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_exact_mount_path_only() {
        assert!(matches_path("/api/v1/infrastructure/entity-creation-limits"));
        assert!(!matches_path(
            "/api/v1/infrastructure/entity-creation-limits/"
        ));
        assert!(!matches_path("/api/infrastructure/entity-creation-limits"));
        assert!(!matches_path("/api/v1/infrastructure/blocked-ips"));
        assert!(!matches_path("/"));
    }

    #[test]
    fn groups_rows_by_table_and_orders_tiers() {
        let rows = vec![
            json!({ "table_name": "tasks", "tier": "FREE", "total_limit": 10 }),
            json!({ "table_name": "tasks", "tier": "PRO", "total_limit": 100 }),
            json!({ "table_name": "boards", "tier": "PLUS", "total_limit": 5 }),
            json!({ "table_name": "boards", "tier": "FREE", "total_limit": 1 }),
        ];

        let groups = build_table_groups(rows);

        // Groups are ordered by table name.
        assert_eq!(groups.len(), 2);
        assert_eq!(groups[0]["tableName"], "boards");
        assert_eq!(groups[1]["tableName"], "tasks");

        // metadata is the first row encountered for the group.
        assert_eq!(groups[0]["metadata"]["tier"], "PLUS");
        assert_eq!(groups[1]["metadata"]["tier"], "FREE");

        // tiers follow TIER_ORDER and omit absent tiers.
        let boards_tiers = groups[0]["tiers"].as_array().unwrap();
        assert_eq!(boards_tiers.len(), 2);
        assert_eq!(boards_tiers[0]["tier"], "FREE");
        assert_eq!(boards_tiers[1]["tier"], "PLUS");

        let tasks_tiers = groups[1]["tiers"].as_array().unwrap();
        assert_eq!(tasks_tiers.len(), 2);
        assert_eq!(tasks_tiers[0]["tier"], "FREE");
        assert_eq!(tasks_tiers[1]["tier"], "PRO");
    }

    #[test]
    fn empty_rows_produce_no_groups() {
        assert!(build_table_groups(Vec::new()).is_empty());
    }

    #[test]
    fn unknown_tiers_are_omitted_from_tiers_array() {
        let rows = vec![
            json!({ "table_name": "tasks", "tier": "FREE" }),
            json!({ "table_name": "tasks", "tier": "LEGACY" }),
        ];

        let groups = build_table_groups(rows);
        let tiers = groups[0]["tiers"].as_array().unwrap();
        assert_eq!(tiers.len(), 1);
        assert_eq!(tiers[0]["tier"], "FREE");
    }
}
