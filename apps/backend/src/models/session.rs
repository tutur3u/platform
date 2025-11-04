//! # Session Model
//!
//! Models for authentication sessions and JWT tokens.

use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

/// Session model for tracking user authentication sessions
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Session {
    /// Unique session identifier
    pub id: Uuid,

    /// User ID this session belongs to
    pub user_id: Uuid,

    /// JWT refresh token
    pub refresh_token: String,

    /// IP address of the client
    pub ip_address: Option<String>,

    /// User agent string
    pub user_agent: Option<String>,

    /// When the session expires
    pub expires_at: DateTime<Utc>,

    /// When the session was created
    pub created_at: DateTime<Utc>,

    /// When the session was last used
    pub last_used_at: DateTime<Utc>,

    /// Whether the session is still active
    pub is_active: bool,
}

impl Session {
    /// Create a new session
    ///
    /// # Arguments
    ///
    /// * `user_id` - The user this session belongs to
    /// * `refresh_token` - JWT refresh token
    /// * `expires_in_hours` - How many hours until the session expires
    /// * `ip_address` - Optional client IP address
    /// * `user_agent` - Optional client user agent
    pub fn new(
        user_id: Uuid,
        refresh_token: String,
        expires_in_hours: i64,
        ip_address: Option<String>,
        user_agent: Option<String>,
    ) -> Self {
        let now = Utc::now();
        let expires_at = now + Duration::hours(expires_in_hours);

        Self {
            id: Uuid::new_v4(),
            user_id,
            refresh_token,
            ip_address,
            user_agent,
            expires_at,
            created_at: now,
            last_used_at: now,
            is_active: true,
        }
    }

    /// Check if the session is expired
    pub fn is_expired(&self) -> bool {
        Utc::now() > self.expires_at
    }

    /// Check if the session is valid (active and not expired)
    pub fn is_valid(&self) -> bool {
        self.is_active && !self.is_expired()
    }

    /// Update last used timestamp
    pub fn update_last_used(&mut self) {
        self.last_used_at = Utc::now();
    }

    /// Revoke the session
    pub fn revoke(&mut self) {
        self.is_active = false;
    }

    /// Extend the session expiration
    pub fn extend(&mut self, hours: i64) {
        self.expires_at = Utc::now() + Duration::hours(hours);
    }
}

/// JWT Claims structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    /// Subject (user ID)
    pub sub: String,

    /// User email
    pub email: String,

    /// User role
    pub role: String,

    /// Issued at timestamp
    pub iat: i64,

    /// Expiration timestamp
    pub exp: i64,

    /// Token type (access or refresh)
    #[serde(rename = "type")]
    pub token_type: TokenType,
}

/// Token type enumeration
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TokenType {
    Access,
    Refresh,
}

impl Claims {
    /// Create new access token claims
    pub fn new_access_token(
        user_id: Uuid,
        email: String,
        role: String,
        expires_in_hours: i64,
    ) -> Self {
        let now = Utc::now();
        Self {
            sub: user_id.to_string(),
            email,
            role,
            iat: now.timestamp(),
            exp: (now + Duration::hours(expires_in_hours)).timestamp(),
            token_type: TokenType::Access,
        }
    }

    /// Create new refresh token claims
    pub fn new_refresh_token(
        user_id: Uuid,
        email: String,
        role: String,
        expires_in_days: i64,
    ) -> Self {
        let now = Utc::now();
        Self {
            sub: user_id.to_string(),
            email,
            role,
            iat: now.timestamp(),
            exp: (now + Duration::days(expires_in_days)).timestamp(),
            token_type: TokenType::Refresh,
        }
    }

    /// Check if the token is expired
    pub fn is_expired(&self) -> bool {
        Utc::now().timestamp() > self.exp
    }

    /// Check if this is an access token
    pub fn is_access_token(&self) -> bool {
        self.token_type == TokenType::Access
    }

    /// Check if this is a refresh token
    pub fn is_refresh_token(&self) -> bool {
        self.token_type == TokenType::Refresh
    }

    /// Get user ID from claims
    pub fn user_id(&self) -> Result<Uuid, uuid::Error> {
        Uuid::parse_str(&self.sub)
    }
}

/// Token pair (access + refresh)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenPair {
    /// Access token (short-lived)
    pub access_token: String,

    /// Refresh token (long-lived)
    pub refresh_token: String,

    /// Token type (always "Bearer")
    pub token_type: String,

    /// Expiration time in seconds
    pub expires_in: i64,
}

impl TokenPair {
    /// Create a new token pair
    pub fn new(access_token: String, refresh_token: String, expires_in: i64) -> Self {
        Self {
            access_token,
            refresh_token,
            token_type: "Bearer".to_string(),
            expires_in,
        }
    }
}

/// Login request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

/// Register request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterRequest {
    pub email: String,
    pub password: String,
    pub name: String,
}

/// Refresh token request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RefreshTokenRequest {
    pub refresh_token: String,
}

/// Change password request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangePasswordRequest {
    pub current_password: String,
    pub new_password: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_session_creation() {
        let user_id = Uuid::new_v4();
        let session = Session::new(
            user_id,
            "refresh_token".to_string(),
            24,
            Some("127.0.0.1".to_string()),
            Some("Mozilla/5.0".to_string()),
        );

        assert_eq!(session.user_id, user_id);
        assert!(session.is_active);
        assert!(session.is_valid());
        assert!(!session.is_expired());
    }

    #[test]
    fn test_session_expiration() {
        let user_id = Uuid::new_v4();
        let mut session = Session::new(
            user_id,
            "refresh_token".to_string(),
            0, // Expires immediately
            None,
            None,
        );

        // Manually set expiration to past
        session.expires_at = Utc::now() - Duration::hours(1);

        assert!(session.is_expired());
        assert!(!session.is_valid());
    }

    #[test]
    fn test_session_revoke() {
        let user_id = Uuid::new_v4();
        let mut session = Session::new(user_id, "refresh_token".to_string(), 24, None, None);

        assert!(session.is_valid());
        session.revoke();
        assert!(!session.is_valid());
        assert!(!session.is_active);
    }

    #[test]
    fn test_session_extend() {
        let user_id = Uuid::new_v4();
        let mut session = Session::new(user_id, "refresh_token".to_string(), 1, None, None);

        let original_expiry = session.expires_at;
        session.extend(24);
        assert!(session.expires_at > original_expiry);
    }

    #[test]
    fn test_access_token_claims() {
        let user_id = Uuid::new_v4();
        let claims = Claims::new_access_token(
            user_id,
            "test@example.com".to_string(),
            "user".to_string(),
            1,
        );

        assert!(claims.is_access_token());
        assert!(!claims.is_refresh_token());
        assert!(!claims.is_expired());
        assert_eq!(claims.user_id().unwrap(), user_id);
    }

    #[test]
    fn test_refresh_token_claims() {
        let user_id = Uuid::new_v4();
        let claims = Claims::new_refresh_token(
            user_id,
            "test@example.com".to_string(),
            "user".to_string(),
            7,
        );

        assert!(claims.is_refresh_token());
        assert!(!claims.is_access_token());
        assert!(!claims.is_expired());
    }

    #[test]
    fn test_token_pair() {
        let pair = TokenPair::new(
            "access_token".to_string(),
            "refresh_token".to_string(),
            3600,
        );

        assert_eq!(pair.token_type, "Bearer");
        assert_eq!(pair.expires_in, 3600);
    }

    #[test]
    fn test_update_last_used() {
        let user_id = Uuid::new_v4();
        let mut session = Session::new(user_id, "refresh_token".to_string(), 24, None, None);

        let original_last_used = session.last_used_at;
        std::thread::sleep(std::time::Duration::from_millis(10));
        session.update_last_used();
        assert!(session.last_used_at > original_last_used);
    }
}
