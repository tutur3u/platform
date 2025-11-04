//! # Authentication Middleware
//!
//! JWT token validation and user extraction.

use crate::middleware::error::{AppError, Result};
use crate::models::Claims;
use axum::{extract::Request, http::header::AUTHORIZATION, middleware::Next, response::Response};
use jsonwebtoken::{DecodingKey, Validation, decode};

/// Extract and validate JWT token from Authorization header
///
/// Expected format: "Bearer <token>"
pub async fn auth_middleware(mut request: Request, next: Next) -> Result<Response> {
    // Extract authorization header
    let auth_header = request
        .headers()
        .get(AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
        .ok_or_else(|| AppError::Unauthorized("Missing authorization header".to_string()))?;

    // Check for Bearer prefix
    if !auth_header.starts_with("Bearer ") {
        return Err(AppError::Unauthorized(
            "Invalid authorization format".to_string(),
        ));
    }

    // Extract token
    let token = auth_header.trim_start_matches("Bearer ");

    // Get JWT secret from environment
    let jwt_secret = std::env::var("JWT_SECRET")
        .map_err(|_| AppError::InternalServer("JWT_SECRET not configured".to_string()))?;

    // Validate token
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(jwt_secret.as_bytes()),
        &Validation::default(),
    )?;

    // Verify it's an access token
    if !token_data.claims.is_access_token() {
        return Err(AppError::Unauthorized("Invalid token type".to_string()));
    }

    // Check if token is expired
    if token_data.claims.is_expired() {
        return Err(AppError::Unauthorized("Token expired".to_string()));
    }

    // Store claims in request extensions for handlers to access
    request.extensions_mut().insert(token_data.claims);

    Ok(next.run(request).await)
}

/// Optional authentication - doesn't fail if no token provided
#[allow(dead_code)]
pub async fn optional_auth_middleware(mut request: Request, next: Next) -> Response {
    // Try to extract and validate token, but don't fail if missing
    if let Some(auth_header) = request
        .headers()
        .get(AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
    {
        if auth_header.starts_with("Bearer ") {
            let token = auth_header.trim_start_matches("Bearer ");

            if let Ok(jwt_secret) = std::env::var("JWT_SECRET") {
                if let Ok(token_data) = decode::<Claims>(
                    token,
                    &DecodingKey::from_secret(jwt_secret.as_bytes()),
                    &Validation::default(),
                ) {
                    // Only store if valid and not expired
                    if !token_data.claims.is_expired() {
                        request.extensions_mut().insert(token_data.claims);
                    }
                }
            }
        }
    }

    next.run(request).await
}
