//! Port of `apps/web/src/app/api/v1/infrastructure/auth-recovery/route.ts`
//! — GET only; POST falls through to Next.js (returns `None`).
//!
//! ## Auth
//!
//! `view_infrastructure` permission on the root workspace, matching
//! `authorizeAbuseIntelligenceRequest` in the legacy GET handler.
//!
//! ## Behavior gaps vs. legacy
//!
//! - `emailInfrastructure` / `user` / `diagnostics.authUser`: always `null`.
//!   The legacy route calls `checkEmailInfrastructureBlocked` (external email
//!   provider API) and `admin.auth.admin.getUserById` (Supabase Auth Admin
//!   API). Neither is accessible through the standard PostgREST endpoint.
//! - `diagnostics.emailBlocked` / `diagnostics.emailBlockedReason`: `false` /
//!   `null` (follows from the `emailInfrastructure` gap above).
//! - Email normalization: the port uses `email.trim().to_lowercase()` matching
//!   the common case of `validateEmail(email.trim())` in the legacy code.

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

#[allow(dead_code)]
const AUTH_RECOVERY_PATH: &str = "/api/v1/infrastructure/auth-recovery";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const VIEW_INFRA: &str = "view_infrastructure";
const PRIVATE_SCHEMA: &str = "private";
/// 24 h in seconds — matches `RELATED_IP_LOOKBACK_MS` in `recovery-store.ts`.
const RELATED_IP_LOOKBACK_SECS: u64 = 86_400;

pub(crate) async fn handle_infrastructure_auth_recovery_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let segs: Vec<&str> = request.path.trim_start_matches('/').split('/').collect();
    let is_match = segs.first().copied() == Some("api")
        && segs.get(1).copied() == Some("v1")
        && segs.get(2).copied() == Some("infrastructure")
        && segs.get(3).copied() == Some("auth-recovery")
        && segs.len() == 4;
    if !is_match {
        return None;
    }

    Some(match request.method {
        "GET" => auth_recovery_get(config, request, outbound).await,
        _ => return None,
    })
}

async fn auth_recovery_get(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    match authorize_workspace_permission(
        &config.contact_data,
        request,
        ROOT_WORKSPACE_ID,
        VIEW_INFRA,
        outbound,
    )
    .await
    {
        Ok(_) => {}
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            return no_store_response(json_response(401, json!({ "message": "Unauthorized" })));
        }
        Err(
            WorkspacePermissionAuthorizationError::Forbidden
            | WorkspacePermissionAuthorizationError::NotFound,
        ) => {
            return no_store_response(json_response(403, json!({ "message": "Forbidden" })));
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return err_500();
        }
    }

    let email = email_from_url(request.url);
    let cd = &config.contact_data;

    // All overrides (private schema, up to 50)
    let overrides_rows = match fetch_rows(cd, outbound, true, "auth_recovery_overrides", {
        let mut p = base_params("created_at.desc", 50);
        if let Some(ref em) = email {
            p.push(("email", format!("eq.{em}")));
        }
        p
    })
    .await
    {
        Ok(r) => r,
        Err(()) => return err_500(),
    };

    // Active override (not revoked, not expired, limit 1)
    let active_row = match fetch_rows(cd, outbound, true, "auth_recovery_overrides", {
        let mut p = vec![
            ("select", "*".to_owned()),
            ("revoked_at", "is.null".to_owned()),
            ("expires_at", "gt.now()".to_owned()),
            ("order", "created_at.desc".to_owned()),
            ("limit", "1".to_owned()),
        ];
        if let Some(ref em) = email {
            p.push(("email", format!("eq.{em}")));
        }
        p
    })
    .await
    {
        Ok(r) => r,
        Err(()) => return err_500(),
    };

    // Recovery events (private schema, up to 50)
    let events_rows = match fetch_rows(cd, outbound, true, "auth_recovery_events", {
        let mut p = base_params("created_at.desc", 50);
        if let Some(ref em) = email {
            p.push(("email", format!("eq.{em}")));
        }
        p
    })
    .await
    {
        Ok(r) => r,
        Err(()) => return err_500(),
    };

    // Email-scoped public queries
    let (recent_auth_events, related_ip_blocks) = if let Some(ref em) = email {
        let recent = match fetch_rows(
            cd,
            outbound,
            false,
            "abuse_events",
            vec![
                (
                    "select",
                    "id,created_at,event_type,ip_address,email,metadata".to_owned(),
                ),
                ("email", format!("eq.{em}")),
                ("order", "created_at.desc".to_owned()),
                ("limit", "20".to_owned()),
            ],
        )
        .await
        {
            Ok(r) => r,
            Err(()) => return err_500(),
        };

        let lookback = unix_secs_to_iso(
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0)
                .saturating_sub(RELATED_IP_LOOKBACK_SECS),
        );
        let ip_rows = match fetch_rows(
            cd,
            outbound,
            false,
            "abuse_events",
            vec![
                ("select", "ip_address".to_owned()),
                ("email", format!("eq.{em}")),
                ("event_type", "in.(otp_send,otp_verify_failed)".to_owned()),
                ("created_at", format!("gte.{lookback}")),
            ],
        )
        .await
        {
            Ok(r) => r,
            Err(()) => return err_500(),
        };

        let unique_ips = collect_unique_ips(&ip_rows);
        let blocks = if unique_ips.is_empty() {
            Vec::new()
        } else {
            match fetch_rows(
                cd,
                outbound,
                false,
                "blocked_ips",
                vec![
                    (
                        "select",
                        "id,ip_address,reason,block_level,blocked_at,expires_at,status".to_owned(),
                    ),
                    ("ip_address", format!("in.({})", unique_ips.join(","))),
                    ("reason", "in.(otp_send,otp_verify_failed)".to_owned()),
                    ("status", "eq.active".to_owned()),
                    ("expires_at", "gt.now()".to_owned()),
                    ("order", "blocked_at.desc".to_owned()),
                    ("limit", "50".to_owned()),
                ],
            )
            .await
            {
                Ok(r) => r,
                Err(()) => return err_500(),
            }
        };

        (recent, blocks)
    } else {
        (Vec::new(), Vec::new())
    };

    let overrides: Vec<Value> = overrides_rows.iter().map(map_override).collect();
    let active_override: Value = active_row.first().map(map_override).unwrap_or(Value::Null);
    let events: Vec<Value> = events_rows.iter().map(map_event).collect();
    let ip_blocks_json: Vec<Value> = related_ip_blocks.iter().map(map_ip_block).collect();

    let diagnostics = if email.is_some() {
        json!({
            "activeOverride": active_override.clone(),
            "authUser": Value::Null,
            "emailBlocked": false,
            "emailBlockedReason": Value::Null,
            "recentAbuseEvents": recent_auth_events.clone(),
            "relatedIpBlocks": ip_blocks_json,
        })
    } else {
        Value::Null
    };

    no_store_response(json_response(
        200,
        json!({
            "activeOverride": active_override,
            "diagnostics": diagnostics,
            "email": email.map(Value::String).unwrap_or(Value::Null),
            "emailInfrastructure": Value::Null,
            "events": events,
            "overrides": overrides,
            "recentAuthEvents": recent_auth_events,
            "user": Value::Null,
        }),
    ))
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn err_500() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "message": "Failed to load auth recovery snapshot" }),
    ))
}

fn base_params(order: &str, limit: u32) -> Vec<(&'static str, String)> {
    vec![
        ("select", "*".to_owned()),
        ("order", order.to_owned()),
        ("limit", limit.to_string()),
    ]
}

async fn fetch_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    private_schema: bool,
    table: &str,
    params: Vec<(&str, String)>,
) -> Result<Vec<Value>, ()> {
    let url = contact_data.rest_url(table, &params).ok_or(())?;
    let key = contact_data.service_role_key().ok_or(())?;
    let auth = format!("Bearer {key}");
    let mut req = OutboundRequest::new(OutboundMethod::Get, &url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &auth)
        .with_header("apikey", key);
    if private_schema {
        req = req
            .with_header("Accept-Profile", PRIVATE_SCHEMA)
            .with_header("Content-Profile", PRIVATE_SCHEMA);
    }
    let resp = outbound.send(req).await.map_err(|_| ())?;
    if !(200..300).contains(&resp.status) {
        return Err(());
    }
    resp.json::<Vec<Value>>().map_err(|_| ())
}

/// `toOverrideSummary`: maps snake_case DB row → camelCase summary.
fn map_override(row: &Value) -> Value {
    json!({
        "allowNormalLogin": row.get("allow_normal_login").and_then(Value::as_bool).unwrap_or(false),
        "allowRecoveryEmail": row.get("allow_recovery_email").and_then(Value::as_bool).unwrap_or(false),
        "createdAt": str_or_empty(row, "created_at"),
        "createdBy": opt_str(row, "created_by"),
        "email": str_or_empty(row, "email"),
        "expiresAt": str_or_empty(row, "expires_at"),
        "id": str_or_empty(row, "id"),
        "lastUsedAt": opt_str(row, "last_used_at"),
        "reason": opt_str(row, "reason"),
        "revokedAt": opt_str(row, "revoked_at"),
        "revokedBy": opt_str(row, "revoked_by"),
        "revokeReason": opt_str(row, "revoke_reason"),
    })
}

/// `toEventSummary`: maps snake_case DB row → camelCase summary.
fn map_event(row: &Value) -> Value {
    json!({
        "actorUserId": opt_str(row, "actor_user_id"),
        "createdAt": str_or_empty(row, "created_at"),
        "email": str_or_empty(row, "email"),
        "eventType": str_or_empty(row, "event_type"),
        "id": str_or_empty(row, "id"),
        "metadata": row.get("metadata").cloned().unwrap_or(json!({})),
        "overrideId": opt_str(row, "override_id"),
        "tokenId": opt_str(row, "token_id"),
    })
}

/// `toRelatedIpBlockSummary`: maps snake_case DB row → camelCase summary.
fn map_ip_block(row: &Value) -> Value {
    json!({
        "blockLevel": row.get("block_level").and_then(Value::as_i64),
        "blockedAt": opt_str(row, "blocked_at"),
        "expiresAt": opt_str(row, "expires_at"),
        "id": str_or_empty(row, "id"),
        "ipAddress": str_or_empty(row, "ip_address"),
        "reason": opt_str(row, "reason"),
        "status": opt_str(row, "status"),
    })
}

fn str_or_empty<'a>(v: &'a Value, field: &str) -> &'a str {
    v.get(field).and_then(Value::as_str).unwrap_or("")
}

fn opt_str<'a>(v: &'a Value, field: &str) -> Option<&'a str> {
    v.get(field)
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
}

fn email_from_url(url: Option<&str>) -> Option<String> {
    let u = url.and_then(|s| url::Url::parse(s).ok())?;
    let raw = u
        .query_pairs()
        .find_map(|(k, v)| (k == "email").then(|| v.into_owned()))?;
    let norm = raw.trim().to_lowercase();
    (norm.contains('@')).then_some(norm)
}

fn collect_unique_ips(rows: &[Value]) -> Vec<String> {
    let mut seen = std::collections::BTreeSet::new();
    for row in rows {
        if let Some(ip) = row.get("ip_address").and_then(Value::as_str)
            && !ip.is_empty()
        {
            seen.insert(ip.to_owned());
        }
    }
    seen.into_iter().collect()
}

/// Converts Unix seconds to `YYYY-MM-DDTHH:MM:SS.000Z` using Howard
/// Hinnant's civil_from_days algorithm.
fn unix_secs_to_iso(secs: u64) -> String {
    let days = (secs / 86_400) as i64;
    let rem = secs % 86_400;
    let h = rem / 3_600;
    let mi = (rem % 3_600) / 60;
    let se = rem % 60;

    let z = days + 719_468;
    let era: i64 = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m: i64 = if mp < 10 { mp + 3 } else { mp - 9 };
    let yr: i64 = if m <= 2 { y + 1 } else { y };

    format!("{yr:04}-{m:02}-{d:02}T{h:02}:{mi:02}:{se:02}.000Z")
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn path_ok(path: &str) -> bool {
        let segs: Vec<&str> = path.trim_start_matches('/').split('/').collect();
        segs.first().copied() == Some("api")
            && segs.get(1).copied() == Some("v1")
            && segs.get(2).copied() == Some("infrastructure")
            && segs.get(3).copied() == Some("auth-recovery")
            && segs.len() == 4
    }

    #[test]
    fn path_guard_matches_route() {
        assert!(path_ok(AUTH_RECOVERY_PATH));
    }

    #[test]
    fn path_guard_rejects_children_and_siblings() {
        assert!(!path_ok("/api/v1/infrastructure/auth-recovery/extra"));
        assert!(!path_ok("/api/v1/infrastructure/blocked-ips"));
        assert!(!path_ok("/api/v1/infrastructure"));
    }

    #[test]
    fn path_guard_safe_on_short_paths() {
        assert!(!path_ok("/"));
        assert!(!path_ok("/api"));
        assert!(!path_ok(""));
    }

    #[test]
    fn email_normalised_and_lowercased() {
        let url = "https://t.test/api/v1/infrastructure/auth-recovery?email=User%40Example.COM";
        assert_eq!(
            email_from_url(Some(url)),
            Some("user@example.com".to_owned())
        );
    }

    #[test]
    fn email_absent_returns_none() {
        assert_eq!(
            email_from_url(Some("https://t.test/api/v1/infrastructure/auth-recovery")),
            None
        );
    }

    #[test]
    fn email_without_at_returns_none() {
        let url = "https://t.test/api/v1/infrastructure/auth-recovery?email=notanemail";
        assert_eq!(email_from_url(Some(url)), None);
    }

    #[test]
    fn collect_unique_ips_deduplicates() {
        let rows = vec![
            json!({"ip_address": "1.2.3.4"}),
            json!({"ip_address": "5.6.7.8"}),
            json!({"ip_address": "1.2.3.4"}),
            json!({"ip_address": ""}),
            json!({}),
        ];
        let mut ips = collect_unique_ips(&rows);
        ips.sort();
        assert_eq!(ips, vec!["1.2.3.4", "5.6.7.8"]);
    }

    #[test]
    fn map_override_maps_fields() {
        let row = json!({
            "id": "ov-1", "email": "u@e.com",
            "allow_normal_login": true, "allow_recovery_email": false,
            "created_at": "2024-01-01T00:00:00+00:00", "created_by": "admin-1",
            "expires_at": "2025-01-01T00:00:00+00:00",
            "last_used_at": null, "reason": "locked",
            "revoked_at": null, "revoked_by": null, "revoke_reason": null,
        });
        let s = map_override(&row);
        assert_eq!(s["id"], "ov-1");
        assert_eq!(s["allowNormalLogin"], true);
        assert_eq!(s["allowRecoveryEmail"], false);
        assert_eq!(s["createdBy"], "admin-1");
        assert_eq!(s["revokedAt"], Value::Null);
    }

    #[test]
    fn map_event_maps_fields() {
        let row = json!({
            "id": "ev-1", "email": "u@e.com",
            "event_type": "recovery_email_sent",
            "created_at": "2024-06-01T12:00:00+00:00",
            "actor_user_id": "admin-1", "metadata": {"k": "v"},
            "override_id": "ov-1", "token_id": "tok-1",
        });
        let s = map_event(&row);
        assert_eq!(s["eventType"], "recovery_email_sent");
        assert_eq!(s["actorUserId"], "admin-1");
        assert_eq!(s["metadata"]["k"], "v");
    }

    #[test]
    fn map_ip_block_maps_fields() {
        let row = json!({
            "id": "blk-1", "ip_address": "1.2.3.4",
            "reason": "otp_send", "block_level": 2,
            "blocked_at": "2024-01-01T00:00:00+00:00",
            "expires_at": "2024-01-02T00:00:00+00:00", "status": "active",
        });
        let s = map_ip_block(&row);
        assert_eq!(s["ipAddress"], "1.2.3.4");
        assert_eq!(s["blockLevel"], 2);
    }

    #[test]
    fn unix_secs_to_iso_epoch() {
        assert_eq!(unix_secs_to_iso(0), "1970-01-01T00:00:00.000Z");
    }

    #[test]
    fn unix_secs_to_iso_known_timestamp() {
        // 2024-01-15 10:30:45 UTC
        assert_eq!(unix_secs_to_iso(1_705_314_645), "2024-01-15T10:30:45.000Z");
    }
}
