use super::*;

// ---------------------------------------------------------------------------
// Response types (serialised → caller)
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub(super) struct SquareSettingsResponse {
    #[serde(rename = "wsId")]
    pub(super) ws_id: String,
    pub(super) environment: String,
    #[serde(rename = "locationId")]
    pub(super) location_id: Option<String>,
    #[serde(rename = "locationName")]
    pub(super) location_name: Option<String>,
    #[serde(rename = "deviceId")]
    pub(super) device_id: Option<String>,
    #[serde(rename = "deviceName")]
    pub(super) device_name: Option<String>,
    #[serde(rename = "sandboxDeviceId")]
    pub(super) sandbox_device_id: Option<String>,
    pub(super) readiness: ReadinessResponse,
    #[serde(rename = "appCredentials")]
    pub(super) app_credentials: Vec<AppCredentialResponse>,
    pub(super) connections: Vec<ConnectionResponse>,
}

#[derive(Serialize)]
pub(super) struct ReadinessResponse {
    pub(super) ready: bool,
    pub(super) issues: Vec<String>,
}

#[derive(Serialize)]
pub(super) struct AppCredentialResponse {
    pub(super) environment: String,
    #[serde(rename = "applicationId")]
    pub(super) application_id: Option<String>,
    #[serde(rename = "applicationSecretLast4")]
    pub(super) application_secret_last4: Option<String>,
    #[serde(rename = "applicationSecretFingerprint")]
    pub(super) application_secret_fingerprint: Option<String>,
    #[serde(rename = "oauthRedirectUrl")]
    pub(super) oauth_redirect_url: Option<String>,
    #[serde(rename = "webhookNotificationUrl")]
    pub(super) webhook_notification_url: Option<String>,
    #[serde(rename = "updatedAt")]
    pub(super) updated_at: Option<String>,
}

#[derive(Serialize)]
pub(super) struct ConnectionResponse {
    pub(super) environment: String,
    #[serde(rename = "authMethod")]
    pub(super) auth_method: String,
    #[serde(rename = "merchantId")]
    pub(super) merchant_id: Option<String>,
    #[serde(rename = "accessTokenLast4")]
    pub(super) access_token_last4: Option<String>,
    #[serde(rename = "accessTokenFingerprint")]
    pub(super) access_token_fingerprint: Option<String>,
    #[serde(rename = "refreshTokenLast4")]
    pub(super) refresh_token_last4: Option<String>,
    #[serde(rename = "tokenExpiresAt")]
    pub(super) token_expires_at: Option<String>,
    pub(super) scopes: Vec<String>,
    pub(super) status: String,
    #[serde(rename = "lastValidatedAt")]
    pub(super) last_validated_at: Option<String>,
    #[serde(rename = "lastError")]
    pub(super) last_error: Option<String>,
    #[serde(rename = "updatedAt")]
    pub(super) updated_at: Option<String>,
    #[serde(rename = "webhookSignatureKeyLast4")]
    pub(super) webhook_signature_key_last4: Option<String>,
}

// ---------------------------------------------------------------------------
// Row types (deserialised ← Supabase)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub(super) struct SquareSettingsRow {
    pub(super) environment: Option<String>,
    pub(super) location_id: Option<String>,
    pub(super) location_name: Option<String>,
    pub(super) device_id: Option<String>,
    pub(super) device_name: Option<String>,
    pub(super) sandbox_device_id: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct SquareConnectionRow {
    pub(super) environment: Option<String>,
    pub(super) auth_method: Option<String>,
    pub(super) merchant_id: Option<String>,
    pub(super) access_token_fingerprint: Option<String>,
    pub(super) access_token_last4: Option<String>,
    pub(super) refresh_token_last4: Option<String>,
    pub(super) token_expires_at: Option<String>,
    pub(super) scopes: Option<Vec<String>>,
    /// Used for the `webhook_signature_missing` readiness check (presence only).
    pub(super) webhook_signature_key_encrypted: Option<String>,
    pub(super) webhook_signature_key_last4: Option<String>,
    pub(super) status: Option<String>,
    pub(super) last_validated_at: Option<String>,
    pub(super) last_error: Option<String>,
    pub(super) updated_at: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct SquareAppCredentialRow {
    pub(super) environment: Option<String>,
    pub(super) application_id: Option<String>,
    /// Used for the `app_credentials_missing` readiness check (presence only).
    pub(super) application_secret_encrypted: Option<String>,
    pub(super) application_secret_fingerprint: Option<String>,
    pub(super) application_secret_last4: Option<String>,
    pub(super) oauth_redirect_url: Option<String>,
    pub(super) webhook_notification_url: Option<String>,
    pub(super) updated_at: Option<String>,
}

// ---------------------------------------------------------------------------
// Auth helper types (copied from workspaces_inventory_polar_settings pattern)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub(super) struct PermissionRow {
    pub(super) permission: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct WorkspaceIdRow {
    pub(super) id: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    pub(super) membership_type: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct WorkspaceRow {
    pub(super) creator_id: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) struct InventorySquareUser {
    pub(super) access_token: Option<String>,
    pub(super) id: String,
}

pub(super) enum DataAuth<'a> {
    AccessToken(&'a str),
    ServiceRole,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum MembershipCheck {
    Member,
    NotMember,
}

pub(super) struct EffectivePermissions {
    pub(super) has_all_permissions: bool,
    pub(super) permissions: Vec<String>,
}
