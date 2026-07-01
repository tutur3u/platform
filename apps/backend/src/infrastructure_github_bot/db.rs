use super::*;

// ---------------------------------------------------------------------------
// listGitHubBotState (private schema)
// ---------------------------------------------------------------------------

pub(super) async fn list_github_bot_state(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
) -> Result<Value, ()> {
    let Some(configuration) = load_configuration(contact_data, outbound).await? else {
        return Ok(json!({
            "auditEvents": [],
            "clients": [],
            "configuration": Value::Null,
        }));
    };

    let clients = load_watcher_clients(contact_data, outbound).await?;
    let audit_events = load_audit_events(contact_data, outbound).await?;

    Ok(json!({
        "auditEvents": audit_events,
        "clients": clients,
        "configuration": map_config(&configuration),
    }))
}

async fn load_configuration(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
) -> Result<Option<GitHubBotConfigRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "github_bot_configurations",
        &[
            ("select", "*".to_owned()),
            ("id", format!("eq.{GITHUB_BOT_CONFIG_ID}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = private_service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    Ok(response
        .json::<Vec<GitHubBotConfigRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

async fn load_watcher_clients(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
) -> Result<Vec<Value>, ()> {
    let Some(url) = contact_data.rest_url(
        "github_bot_watcher_clients",
        &[
            ("select", "*".to_owned()),
            ("configuration_id", format!("eq.{GITHUB_BOT_CONFIG_ID}")),
            ("order", "created_at.desc".to_owned()),
            ("limit", "50".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = private_service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    Ok(response
        .json::<Vec<GitHubBotWatcherClientRow>>()
        .map_err(|_| ())?
        .iter()
        .map(map_client)
        .collect())
}

async fn load_audit_events(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
) -> Result<Vec<Value>, ()> {
    let Some(url) = contact_data.rest_url(
        "github_bot_audit_events",
        &[
            (
                "select",
                "actor_type,created_at,event_type,id,metadata".to_owned(),
            ),
            ("configuration_id", format!("eq.{GITHUB_BOT_CONFIG_ID}")),
            ("order", "created_at.desc".to_owned()),
            ("limit", "50".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = private_service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    Ok(response
        .json::<Vec<GitHubBotAuditEventRow>>()
        .map_err(|_| ())?
        .into_iter()
        .map(map_audit_event)
        .collect())
}

// ---------------------------------------------------------------------------
// Row mapping (camelCase status shapes)
// ---------------------------------------------------------------------------

fn map_config(row: &GitHubBotConfigRow) -> Value {
    json!({
        "appId": row.app_id,
        "enabled": row.enabled.unwrap_or(false),
        "installationId": row.installation_id,
        "lastValidatedAt": row.last_validated_at,
        "lastValidationError": row.last_validation_error,
        "permissions": { "checks": "write" },
        "privateKeyConfigured": row
            .private_key_encrypted
            .as_deref()
            .is_some_and(|value| !value.is_empty()),
        "privateKeyFingerprint": row.private_key_fingerprint,
        "repository": {
            "name": row.repository_name,
            "owner": row.repository_owner,
        },
        "updatedAt": row.updated_at,
    })
}

fn map_client(row: &GitHubBotWatcherClientRow) -> Value {
    json!({
        "createdAt": row.created_at,
        "expiresAt": row.expires_at,
        "id": row.id,
        "lastFour": row.last_four,
        "lastIssuedAt": row.last_issued_at,
        "lastUsedAt": row.last_used_at,
        "name": row.name,
        "prefix": row.token_prefix,
        "revokedAt": row.revoked_at,
    })
}

fn map_audit_event(row: GitHubBotAuditEventRow) -> Value {
    let metadata = if row.metadata.is_null() {
        Value::Object(Map::new())
    } else {
        row.metadata
    };

    json!({
        "actorType": row.actor_type,
        "createdAt": row.created_at,
        "eventType": row.event_type,
        "id": row.id,
        "metadata": sanitize_audit_metadata(&metadata),
    })
}
