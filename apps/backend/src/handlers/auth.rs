//! # Authentication Handlers
//!
//! Handlers for user authentication (login, register, token refresh).

use crate::middleware::error::{AppError, Result};
use crate::models::{Claims, LoginRequest, RegisterRequest, TokenPair, User, UserRole};
use axum::{Extension, Json};
use chrono::Utc;
use jsonwebtoken::{EncodingKey, Header, encode};
use sqlx::PgPool;
use uuid::Uuid;

/// Register a new user
///
/// Creates a new user account with hashed password.
pub async fn register(
    Extension(pool): Extension<PgPool>,
    Json(payload): Json<RegisterRequest>,
) -> Result<Json<TokenPair>> {
    // Validate email format
    if !payload.email.contains('@') {
        return Err(AppError::ValidationError(
            "Invalid email format".to_string(),
        ));
    }

    // Validate password length
    if payload.password.len() < 8 {
        return Err(AppError::ValidationError(
            "Password must be at least 8 characters".to_string(),
        ));
    }

    // Check if user already exists
    let existing_user: Option<(Uuid,)> = sqlx::query_as("SELECT id FROM users WHERE email = $1")
        .bind(&payload.email)
        .fetch_optional(&pool)
        .await?;

    if existing_user.is_some() {
        return Err(AppError::BadRequest("Email already registered".to_string()));
    }

    // Hash password
    let password_hash = bcrypt::hash(&payload.password, bcrypt::DEFAULT_COST)
        .map_err(|e| AppError::InternalServer(format!("Failed to hash password: {}", e)))?;

    // Create user
    let now = Utc::now();
    let user_id = Uuid::new_v4();

    sqlx::query(
        r#"
        INSERT INTO users (id, email, password_hash, name, email_verified, is_active, role, created_at, updated_at)
        VALUES ($1, $2, $3, $4, false, true, $5, $6, $7)
        "#,
    )
    .bind(user_id)
    .bind(&payload.email)
    .bind(&password_hash)
    .bind(&payload.name)
    .bind(UserRole::User)
    .bind(now)
    .bind(now)
    .execute(&pool)
    .await?;

    // Generate tokens
    let tokens = generate_token_pair(user_id, payload.email, UserRole::User)?;

    Ok(Json(tokens))
}

/// Login with email and password
pub async fn login(
    Extension(pool): Extension<PgPool>,
    Json(payload): Json<LoginRequest>,
) -> Result<Json<TokenPair>> {
    // Find user by email
    let user: Option<(Uuid, String, String, UserRole)> = sqlx::query_as(
        "SELECT id, email, password_hash, role FROM users WHERE email = $1 AND is_active = true",
    )
    .bind(&payload.email)
    .fetch_optional(&pool)
    .await?;

    let (user_id, email, password_hash, user_role) =
        user.ok_or_else(|| AppError::Unauthorized("Invalid email or password".to_string()))?;

    // Verify password
    let valid = bcrypt::verify(&payload.password, &password_hash)
        .map_err(|e| AppError::InternalServer(format!("Failed to verify password: {}", e)))?;

    if !valid {
        return Err(AppError::Unauthorized(
            "Invalid email or password".to_string(),
        ));
    }

    // Update last login
    sqlx::query("UPDATE users SET last_login_at = $1 WHERE id = $2")
        .bind(Utc::now())
        .bind(user_id)
        .execute(&pool)
        .await?;

    // Generate tokens
    let tokens = generate_token_pair(user_id, email, user_role)?;

    Ok(Json(tokens))
}

/// Get current user info
pub async fn me(
    Extension(pool): Extension<PgPool>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<User>> {
    let user_id = claims
        .user_id()
        .map_err(|_| AppError::Unauthorized("Invalid user ID in token".to_string()))?;

    let user: User = sqlx::query_as("SELECT * FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_optional(&pool)
        .await?
        .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    Ok(Json(user))
}

/// Logout (client should discard token)
pub async fn logout() -> Result<Json<serde_json::Value>> {
    Ok(Json(serde_json::json!({
        "message": "Logged out successfully"
    })))
}

/// Helper function to generate access and refresh tokens
fn generate_token_pair(user_id: Uuid, email: String, role: UserRole) -> Result<TokenPair> {
    let jwt_secret = std::env::var("JWT_SECRET")
        .map_err(|_| AppError::InternalServer("JWT_SECRET not configured".to_string()))?;

    let jwt_expiration_hours = std::env::var("JWT_EXPIRATION_HOURS")
        .unwrap_or_else(|_| "24".to_string())
        .parse::<i64>()
        .unwrap_or(24);

    // Create access token (short-lived)
    let access_claims = Claims::new_access_token(
        user_id,
        email.clone(),
        role.to_string(),
        jwt_expiration_hours,
    );

    let access_token = encode(
        &Header::default(),
        &access_claims,
        &EncodingKey::from_secret(jwt_secret.as_bytes()),
    )?;

    // Create refresh token (long-lived)
    let refresh_claims = Claims::new_refresh_token(user_id, email, role.to_string(), 7); // 7 days

    let refresh_token = encode(
        &Header::default(),
        &refresh_claims,
        &EncodingKey::from_secret(jwt_secret.as_bytes()),
    )?;

    Ok(TokenPair::new(
        access_token,
        refresh_token,
        jwt_expiration_hours * 3600, // Convert hours to seconds
    ))
}
