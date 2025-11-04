//! # User Model
//!
//! Domain model representing a user in the system.
//! This model maps to the database schema and includes validation logic.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

/// User model representing a registered user
///
/// This struct maps directly to the users table in the database.
/// All fields are validated before being persisted.
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct User {
    /// Unique user identifier
    pub id: Uuid,

    /// User's email address (unique, used for login)
    pub email: String,

    /// Hashed password (never return to client)
    #[serde(skip_serializing)]
    pub password_hash: String,

    /// User's display name
    pub name: String,

    /// Optional avatar URL
    pub avatar_url: Option<String>,

    /// Whether the user's email is verified
    pub email_verified: bool,

    /// Whether the user account is active
    pub is_active: bool,

    /// User role for authorization
    pub role: UserRole,

    /// When the user was created
    pub created_at: DateTime<Utc>,

    /// When the user was last updated
    pub updated_at: DateTime<Utc>,

    /// When the user last logged in
    pub last_login_at: Option<DateTime<Utc>>,
}

/// User roles for authorization
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, sqlx::Type)]
#[sqlx(type_name = "user_role", rename_all = "lowercase")]
pub enum UserRole {
    #[serde(rename = "user")]
    User,
    #[serde(rename = "admin")]
    Admin,
    #[serde(rename = "moderator")]
    Moderator,
}

impl UserRole {
    /// Check if the role has admin privileges
    pub fn is_admin(&self) -> bool {
        matches!(self, UserRole::Admin)
    }

    /// Check if the role has moderator or admin privileges
    pub fn is_moderator_or_admin(&self) -> bool {
        matches!(self, UserRole::Admin | UserRole::Moderator)
    }
}

impl std::fmt::Display for UserRole {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            UserRole::User => write!(f, "user"),
            UserRole::Admin => write!(f, "admin"),
            UserRole::Moderator => write!(f, "moderator"),
        }
    }
}

impl std::str::FromStr for UserRole {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "user" => Ok(UserRole::User),
            "admin" => Ok(UserRole::Admin),
            "moderator" => Ok(UserRole::Moderator),
            _ => Err(format!("Invalid user role: {}", s)),
        }
    }
}

impl User {
    /// Create a new user with default values
    ///
    /// # Arguments
    ///
    /// * `email` - User's email address
    /// * `password_hash` - Already hashed password
    /// * `name` - User's display name
    ///
    /// # Returns
    ///
    /// A new User instance with default values for other fields
    pub fn new(email: String, password_hash: String, name: String) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4(),
            email,
            password_hash,
            name,
            avatar_url: None,
            email_verified: false,
            is_active: true,
            role: UserRole::User,
            created_at: now,
            updated_at: now,
            last_login_at: None,
        }
    }

    /// Sanitize user data for public API responses
    ///
    /// Returns a PublicUser without sensitive information
    pub fn to_public(&self) -> PublicUser {
        PublicUser {
            id: self.id,
            email: self.email.clone(),
            name: self.name.clone(),
            avatar_url: self.avatar_url.clone(),
            email_verified: self.email_verified,
            role: self.role,
            created_at: self.created_at,
            last_login_at: self.last_login_at,
        }
    }

    /// Update last login timestamp
    pub fn update_last_login(&mut self) {
        self.last_login_at = Some(Utc::now());
        self.updated_at = Utc::now();
    }

    /// Check if user can perform admin actions
    pub fn is_admin(&self) -> bool {
        self.is_active && self.role.is_admin()
    }

    /// Check if user can perform moderator actions
    pub fn is_moderator(&self) -> bool {
        self.is_active && self.role.is_moderator_or_admin()
    }
}

/// Public user representation without sensitive data
///
/// This struct is safe to return in API responses
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublicUser {
    pub id: Uuid,
    pub email: String,
    pub name: String,
    pub avatar_url: Option<String>,
    pub email_verified: bool,
    pub role: UserRole,
    pub created_at: DateTime<Utc>,
    pub last_login_at: Option<DateTime<Utc>>,
}

/// User profile update data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserUpdate {
    pub name: Option<String>,
    pub avatar_url: Option<String>,
}

impl UserUpdate {
    /// Check if the update contains any changes
    pub fn has_changes(&self) -> bool {
        self.name.is_some() || self.avatar_url.is_some()
    }

    /// Apply updates to a user
    pub fn apply_to(&self, user: &mut User) {
        if let Some(ref name) = self.name {
            user.name = name.clone();
        }
        if let Some(ref avatar_url) = self.avatar_url {
            user.avatar_url = Some(avatar_url.clone());
        }
        user.updated_at = Utc::now();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_user_creation() {
        let user = User::new(
            "test@example.com".to_string(),
            "hashed_password".to_string(),
            "Test User".to_string(),
        );

        assert_eq!(user.email, "test@example.com");
        assert_eq!(user.name, "Test User");
        assert_eq!(user.role, UserRole::User);
        assert!(user.is_active);
        assert!(!user.email_verified);
    }

    #[test]
    fn test_user_roles() {
        assert!(UserRole::Admin.is_admin());
        assert!(!UserRole::User.is_admin());
        assert!(UserRole::Admin.is_moderator_or_admin());
        assert!(UserRole::Moderator.is_moderator_or_admin());
        assert!(!UserRole::User.is_moderator_or_admin());
    }

    #[test]
    fn test_to_public() {
        let user = User::new(
            "test@example.com".to_string(),
            "hashed_password".to_string(),
            "Test User".to_string(),
        );

        let public = user.to_public();
        assert_eq!(public.email, user.email);
        assert_eq!(public.name, user.name);
        assert_eq!(public.id, user.id);
    }

    #[test]
    fn test_update_last_login() {
        let mut user = User::new(
            "test@example.com".to_string(),
            "hashed_password".to_string(),
            "Test User".to_string(),
        );

        assert!(user.last_login_at.is_none());
        user.update_last_login();
        assert!(user.last_login_at.is_some());
    }

    #[test]
    fn test_user_update() {
        let mut user = User::new(
            "test@example.com".to_string(),
            "hashed_password".to_string(),
            "Old Name".to_string(),
        );

        let update = UserUpdate {
            name: Some("New Name".to_string()),
            avatar_url: Some("https://example.com/avatar.png".to_string()),
        };

        assert!(update.has_changes());
        update.apply_to(&mut user);

        assert_eq!(user.name, "New Name");
        assert_eq!(
            user.avatar_url,
            Some("https://example.com/avatar.png".to_string())
        );
    }

    #[test]
    fn test_role_display() {
        assert_eq!(UserRole::User.to_string(), "user");
        assert_eq!(UserRole::Admin.to_string(), "admin");
        assert_eq!(UserRole::Moderator.to_string(), "moderator");
    }
}
