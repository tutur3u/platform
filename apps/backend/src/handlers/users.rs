//! # User CRUD Handlers
//!
//! Complete CRUD operations for user management.

use crate::middleware::error::{AppError, Result};
use crate::models::{Claims, PaginatedResponse, PaginationParams, User, UserRole};
use axum::{
    Extension, Json,
    extract::{Path, Query},
};
use sqlx::PgPool;
use std::str::FromStr;
use uuid::Uuid;

/// List all users with pagination
///
/// Query parameters:
/// - page: Page number (default: 1)
/// - per_page: Items per page (default: 20, max: 100)
///
/// Requires: Admin or Moderator role
pub async fn list_users(
    Extension(pool): Extension<PgPool>,
    Extension(claims): Extension<Claims>,
    Query(pagination): Query<PaginationParams>,
) -> Result<Json<PaginatedResponse<User>>> {
    // Check authorization - only admin and moderators can list all users
    let user_role = UserRole::from_str(&claims.role)
        .map_err(|_| AppError::Unauthorized("Invalid role".to_string()))?;

    if !matches!(user_role, UserRole::Admin | UserRole::Moderator) {
        return Err(AppError::Unauthorized(
            "Only admins and moderators can list users".to_string(),
        ));
    }

    let page = pagination.page.unwrap_or(1).max(1);
    let per_page = pagination.per_page.unwrap_or(20).min(100);
    let offset = ((page - 1) * per_page) as i64;

    // Get total count
    let total: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users")
        .fetch_one(&pool)
        .await?;

    // Get paginated users
    let users: Vec<User> =
        sqlx::query_as("SELECT * FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2")
            .bind(per_page as i64)
            .bind(offset)
            .fetch_all(&pool)
            .await?;

    let total_pages = ((total.0 as f64) / (per_page as f64)).ceil() as u32;

    Ok(Json(PaginatedResponse {
        data: users,
        page,
        per_page,
        total: total.0 as u64,
        total_pages,
    }))
}

/// Get a specific user by ID
///
/// Users can view their own profile, admins/moderators can view any profile
pub async fn get_user(
    Extension(pool): Extension<PgPool>,
    Extension(claims): Extension<Claims>,
    Path(user_id): Path<Uuid>,
) -> Result<Json<User>> {
    // Check authorization
    let requesting_user_id = claims
        .user_id()
        .map_err(|_| AppError::Unauthorized("Invalid token".to_string()))?;

    let user_role = UserRole::from_str(&claims.role)
        .map_err(|_| AppError::Unauthorized("Invalid role".to_string()))?;

    // Users can only view their own profile unless they're admin/moderator
    if requesting_user_id != user_id && !matches!(user_role, UserRole::Admin | UserRole::Moderator)
    {
        return Err(AppError::Unauthorized(
            "Cannot view other users' profiles".to_string(),
        ));
    }

    let user: User = sqlx::query_as("SELECT * FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_optional(&pool)
        .await?
        .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    Ok(Json(user))
}

/// Update a user
///
/// Users can update their own profile, admins can update any profile
pub async fn update_user(
    Extension(pool): Extension<PgPool>,
    Extension(claims): Extension<Claims>,
    Path(user_id): Path<Uuid>,
    Json(update_data): Json<UpdateUserRequest>,
) -> Result<Json<User>> {
    // Check authorization
    let requesting_user_id = claims
        .user_id()
        .map_err(|_| AppError::Unauthorized("Invalid token".to_string()))?;

    let user_role = UserRole::from_str(&claims.role)
        .map_err(|_| AppError::Unauthorized("Invalid role".to_string()))?;

    // Users can only update their own profile unless they're admin
    if requesting_user_id != user_id && !matches!(user_role, UserRole::Admin) {
        return Err(AppError::Unauthorized(
            "Cannot update other users' profiles".to_string(),
        ));
    }

    // Build dynamic update query based on provided fields
    let mut query = String::from("UPDATE users SET ");
    let mut updates = Vec::new();
    let mut param_count = 1;

    if let Some(name) = &update_data.name {
        if name.trim().is_empty() {
            return Err(AppError::ValidationError(
                "Name cannot be empty".to_string(),
            ));
        }
        updates.push(format!("name = ${}", param_count));
        param_count += 1;
    }

    if let Some(email) = &update_data.email {
        if !email.contains('@') {
            return Err(AppError::ValidationError(
                "Invalid email format".to_string(),
            ));
        }
        updates.push(format!("email = ${}", param_count));
        param_count += 1;
    }

    // Only admins can change role or active status
    if matches!(user_role, UserRole::Admin) {
        if update_data.role.is_some() {
            updates.push(format!("role = ${}", param_count));
            param_count += 1;
        }

        if update_data.is_active.is_some() {
            updates.push(format!("is_active = ${}", param_count));
            param_count += 1;
        }

        if update_data.email_verified.is_some() {
            updates.push(format!("email_verified = ${}", param_count));
            param_count += 1;
        }
    }

    if updates.is_empty() {
        return Err(AppError::BadRequest("No fields to update".to_string()));
    }

    query.push_str(&updates.join(", "));
    query.push_str(&format!(" WHERE id = ${} RETURNING *", param_count));

    // Build and execute query
    let mut query_builder = sqlx::query_as::<_, User>(&query);

    if let Some(name) = &update_data.name {
        query_builder = query_builder.bind(name);
    }
    if let Some(email) = &update_data.email {
        query_builder = query_builder.bind(email);
    }
    if matches!(user_role, UserRole::Admin) {
        if let Some(role) = &update_data.role {
            query_builder = query_builder.bind(role);
        }
        if let Some(is_active) = update_data.is_active {
            query_builder = query_builder.bind(is_active);
        }
        if let Some(email_verified) = update_data.email_verified {
            query_builder = query_builder.bind(email_verified);
        }
    }
    query_builder = query_builder.bind(user_id);

    let updated_user = query_builder
        .fetch_optional(&pool)
        .await?
        .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    Ok(Json(updated_user))
}

/// Delete a user (soft delete by setting is_active = false)
///
/// Users can delete their own account, admins can delete any account
pub async fn delete_user(
    Extension(pool): Extension<PgPool>,
    Extension(claims): Extension<Claims>,
    Path(user_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>> {
    // Check authorization
    let requesting_user_id = claims
        .user_id()
        .map_err(|_| AppError::Unauthorized("Invalid token".to_string()))?;

    let user_role = UserRole::from_str(&claims.role)
        .map_err(|_| AppError::Unauthorized("Invalid role".to_string()))?;

    // Users can only delete their own account unless they're admin
    if requesting_user_id != user_id && !matches!(user_role, UserRole::Admin) {
        return Err(AppError::Unauthorized(
            "Cannot delete other users' accounts".to_string(),
        ));
    }

    // Soft delete by setting is_active = false
    let result =
        sqlx::query("UPDATE users SET is_active = false WHERE id = $1 AND is_active = true")
            .bind(user_id)
            .execute(&pool)
            .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(
            "User not found or already deleted".to_string(),
        ));
    }

    Ok(Json(serde_json::json!({
        "message": "User deleted successfully",
        "user_id": user_id
    })))
}

/// Change user password
///
/// Users can only change their own password
pub async fn change_password(
    Extension(pool): Extension<PgPool>,
    Extension(claims): Extension<Claims>,
    Path(user_id): Path<Uuid>,
    Json(password_data): Json<ChangePasswordRequest>,
) -> Result<Json<serde_json::Value>> {
    // Check authorization - users can only change their own password
    let requesting_user_id = claims
        .user_id()
        .map_err(|_| AppError::Unauthorized("Invalid token".to_string()))?;

    if requesting_user_id != user_id {
        return Err(AppError::Unauthorized(
            "Cannot change other users' passwords".to_string(),
        ));
    }

    // Validate new password
    if password_data.new_password.len() < 8 {
        return Err(AppError::ValidationError(
            "Password must be at least 8 characters".to_string(),
        ));
    }

    // Get current password hash
    let current_hash: (String,) = sqlx::query_as("SELECT password_hash FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_optional(&pool)
        .await?
        .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    // Verify current password
    let valid = bcrypt::verify(&password_data.current_password, &current_hash.0)
        .map_err(|e| AppError::InternalServer(format!("Failed to verify password: {}", e)))?;

    if !valid {
        return Err(AppError::Unauthorized(
            "Current password is incorrect".to_string(),
        ));
    }

    // Hash new password
    let new_hash = bcrypt::hash(&password_data.new_password, bcrypt::DEFAULT_COST)
        .map_err(|e| AppError::InternalServer(format!("Failed to hash password: {}", e)))?;

    // Update password
    sqlx::query("UPDATE users SET password_hash = $1 WHERE id = $2")
        .bind(&new_hash)
        .bind(user_id)
        .execute(&pool)
        .await?;

    Ok(Json(serde_json::json!({
        "message": "Password changed successfully"
    })))
}

/// Search users by name or email
///
/// Requires: Admin or Moderator role
pub async fn search_users(
    Extension(pool): Extension<PgPool>,
    Extension(claims): Extension<Claims>,
    Query(search_params): Query<SearchUsersQuery>,
) -> Result<Json<Vec<User>>> {
    // Check authorization
    let user_role = UserRole::from_str(&claims.role)
        .map_err(|_| AppError::Unauthorized("Invalid role".to_string()))?;

    if !matches!(user_role, UserRole::Admin | UserRole::Moderator) {
        return Err(AppError::Unauthorized(
            "Only admins and moderators can search users".to_string(),
        ));
    }

    let query_str = format!("%{}%", search_params.q);
    let limit = search_params.limit.unwrap_or(20).min(100);

    let users: Vec<User> = sqlx::query_as(
        "SELECT * FROM users
         WHERE (name ILIKE $1 OR email ILIKE $1) AND is_active = true
         ORDER BY created_at DESC
         LIMIT $2",
    )
    .bind(&query_str)
    .bind(limit as i64)
    .fetch_all(&pool)
    .await?;

    Ok(Json(users))
}

// ============================================================================
// Request/Response Types
// ============================================================================

#[derive(Debug, serde::Deserialize)]
pub struct UpdateUserRequest {
    pub name: Option<String>,
    pub email: Option<String>,
    pub role: Option<UserRole>,
    pub is_active: Option<bool>,
    pub email_verified: Option<bool>,
}

#[derive(Debug, serde::Deserialize)]
pub struct ChangePasswordRequest {
    pub current_password: String,
    pub new_password: String,
}

#[derive(Debug, serde::Deserialize)]
pub struct SearchUsersQuery {
    pub q: String,
    pub limit: Option<u32>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_update_user_request_deserialization() {
        let json = r#"{"name": "New Name", "email": "new@example.com"}"#;
        let req: UpdateUserRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.name, Some("New Name".to_string()));
        assert_eq!(req.email, Some("new@example.com".to_string()));
        assert!(req.role.is_none());
    }

    #[test]
    fn test_change_password_request_deserialization() {
        let json = r#"{"current_password": "old123", "new_password": "new123456"}"#;
        let req: ChangePasswordRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.current_password, "old123");
        assert_eq!(req.new_password, "new123456");
    }

    #[test]
    fn test_search_users_query_deserialization() {
        let json = r#"{"q": "john", "limit": 10}"#;
        let query: SearchUsersQuery = serde_json::from_str(json).unwrap();
        assert_eq!(query.q, "john");
        assert_eq!(query.limit, Some(10));
    }
}
