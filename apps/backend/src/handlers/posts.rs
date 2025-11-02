//! # Post CRUD Handlers
//!
//! Complete CRUD operations for blog posts and content management.

use crate::middleware::error::{AppError, Result};
use crate::models::{Claims, PaginatedResponse, PaginationParams, Post, PostStatus, UserRole};
use axum::{
    Extension, Json,
    extract::{Path, Query},
};
use chrono::Utc;
use sqlx::PgPool;
use std::str::FromStr;
use uuid::Uuid;

/// List all posts with pagination and filtering
///
/// Query parameters:
/// - page: Page number (default: 1)
/// - per_page: Items per page (default: 20, max: 100)
/// - status: Filter by status (draft, published, archived)
/// - author_id: Filter by author
pub async fn list_posts(
    Extension(pool): Extension<PgPool>,
    Query(params): Query<ListPostsQuery>,
) -> Result<Json<PaginatedResponse<Post>>> {
    let page = params.pagination.page.unwrap_or(1).max(1);
    let per_page = params.pagination.per_page.unwrap_or(20).min(100);
    let offset = ((page - 1) * per_page) as i64;

    // Build query based on filters
    let mut query = String::from("SELECT * FROM posts WHERE 1=1");
    let mut count_query = String::from("SELECT COUNT(*) FROM posts WHERE 1=1");

    // Only show published posts unless authenticated user is viewing
    if params.status.is_none() && params.author_id.is_none() {
        query.push_str(" AND status = 'published'");
        count_query.push_str(" AND status = 'published'");
    }

    if let Some(status) = &params.status {
        query.push_str(&format!(" AND status = '{}'", status));
        count_query.push_str(&format!(" AND status = '{}'", status));
    }

    if let Some(author_id) = params.author_id {
        query.push_str(&format!(" AND author_id = '{}'", author_id));
        count_query.push_str(&format!(" AND author_id = '{}'", author_id));
    }

    query.push_str(" ORDER BY created_at DESC LIMIT $1 OFFSET $2");

    // Get total count
    let total: (i64,) = sqlx::query_as(&count_query).fetch_one(&pool).await?;

    // Get paginated posts
    let posts: Vec<Post> = sqlx::query_as(&query)
        .bind(per_page as i64)
        .bind(offset)
        .fetch_all(&pool)
        .await?;

    let total_pages = ((total.0 as f64) / (per_page as f64)).ceil() as u32;

    Ok(Json(PaginatedResponse {
        data: posts,
        page,
        per_page,
        total: total.0 as u64,
        total_pages,
    }))
}

/// Get a specific post by ID or slug
pub async fn get_post(
    Extension(pool): Extension<PgPool>,
    Path(identifier): Path<String>,
) -> Result<Json<Post>> {
    // Try to parse as UUID first, otherwise treat as slug
    let post: Option<Post> = if let Ok(post_id) = Uuid::parse_str(&identifier) {
        sqlx::query_as("SELECT * FROM posts WHERE id = $1")
            .bind(post_id)
            .fetch_optional(&pool)
            .await?
    } else {
        sqlx::query_as("SELECT * FROM posts WHERE slug = $1")
            .bind(&identifier)
            .fetch_optional(&pool)
            .await?
    };

    let mut post = post.ok_or_else(|| AppError::NotFound("Post not found".to_string()))?;

    // Increment view count
    sqlx::query("UPDATE posts SET view_count = view_count + 1 WHERE id = $1")
        .bind(post.id)
        .execute(&pool)
        .await?;

    post.view_count += 1;

    Ok(Json(post))
}

/// Create a new post
///
/// Requires authentication
pub async fn create_post(
    Extension(pool): Extension<PgPool>,
    Extension(claims): Extension<Claims>,
    Json(post_data): Json<CreatePostRequest>,
) -> Result<Json<Post>> {
    let author_id = claims
        .user_id()
        .map_err(|_| AppError::Unauthorized("Invalid token".to_string()))?;

    // Validate input
    if post_data.title.trim().is_empty() {
        return Err(AppError::ValidationError(
            "Title cannot be empty".to_string(),
        ));
    }

    if post_data.content.trim().is_empty() {
        return Err(AppError::ValidationError(
            "Content cannot be empty".to_string(),
        ));
    }

    // Generate slug from title if not provided
    let slug = post_data
        .slug
        .unwrap_or_else(|| generate_slug(&post_data.title));

    // Check if slug already exists
    let existing: Option<(Uuid,)> = sqlx::query_as("SELECT id FROM posts WHERE slug = $1")
        .bind(&slug)
        .fetch_optional(&pool)
        .await?;

    if existing.is_some() {
        return Err(AppError::BadRequest(format!(
            "Post with slug '{}' already exists",
            slug
        )));
    }

    let now = Utc::now();
    let post_id = Uuid::new_v4();
    let status = post_data.status.unwrap_or(PostStatus::Draft);
    let published_at = if status == PostStatus::Published {
        Some(now)
    } else {
        None
    };

    // Create post
    let post: Post = sqlx::query_as(
        r#"
        INSERT INTO posts (
            id, author_id, title, slug, content, excerpt, status,
            tags, featured_image_url, published_at, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
        "#,
    )
    .bind(post_id)
    .bind(author_id)
    .bind(&post_data.title)
    .bind(&slug)
    .bind(&post_data.content)
    .bind(&post_data.excerpt)
    .bind(status)
    .bind(&post_data.tags.unwrap_or_default())
    .bind(&post_data.featured_image_url)
    .bind(published_at)
    .bind(now)
    .bind(now)
    .fetch_one(&pool)
    .await?;

    Ok(Json(post))
}

/// Update a post
///
/// Authors can update their own posts, admins can update any post
pub async fn update_post(
    Extension(pool): Extension<PgPool>,
    Extension(claims): Extension<Claims>,
    Path(post_id): Path<Uuid>,
    Json(update_data): Json<UpdatePostRequest>,
) -> Result<Json<Post>> {
    let user_id = claims
        .user_id()
        .map_err(|_| AppError::Unauthorized("Invalid token".to_string()))?;

    let user_role = UserRole::from_str(&claims.role)
        .map_err(|_| AppError::Unauthorized("Invalid role".to_string()))?;

    // Get existing post
    let existing_post: Post = sqlx::query_as("SELECT * FROM posts WHERE id = $1")
        .bind(post_id)
        .fetch_optional(&pool)
        .await?
        .ok_or_else(|| AppError::NotFound("Post not found".to_string()))?;

    // Check authorization - users can only update their own posts unless admin
    if existing_post.author_id != user_id && !matches!(user_role, UserRole::Admin) {
        return Err(AppError::Unauthorized(
            "Cannot update other users' posts".to_string(),
        ));
    }

    // Build dynamic update query
    let mut query = String::from("UPDATE posts SET ");
    let mut updates = Vec::new();
    let mut param_count = 1;

    if let Some(title) = &update_data.title {
        if title.trim().is_empty() {
            return Err(AppError::ValidationError(
                "Title cannot be empty".to_string(),
            ));
        }
        updates.push(format!("title = ${}", param_count));
        param_count += 1;
    }

    if let Some(slug) = &update_data.slug {
        // Check if new slug conflicts with another post
        let slug_exists: Option<(Uuid,)> =
            sqlx::query_as("SELECT id FROM posts WHERE slug = $1 AND id != $2")
                .bind(slug)
                .bind(post_id)
                .fetch_optional(&pool)
                .await?;

        if slug_exists.is_some() {
            return Err(AppError::BadRequest(format!(
                "Post with slug '{}' already exists",
                slug
            )));
        }

        updates.push(format!("slug = ${}", param_count));
        param_count += 1;
    }

    if let Some(content) = &update_data.content {
        if content.trim().is_empty() {
            return Err(AppError::ValidationError(
                "Content cannot be empty".to_string(),
            ));
        }
        updates.push(format!("content = ${}", param_count));
        param_count += 1;
    }

    if let Some(excerpt) = &update_data.excerpt {
        updates.push(format!("excerpt = ${}", param_count));
        param_count += 1;
    }

    if let Some(status) = &update_data.status {
        updates.push(format!("status = ${}", param_count));
        param_count += 1;
    }

    if let Some(tags) = &update_data.tags {
        updates.push(format!("tags = ${}", param_count));
        param_count += 1;
    }

    if let Some(featured_image_url) = &update_data.featured_image_url {
        updates.push(format!("featured_image_url = ${}", param_count));
        param_count += 1;
    }

    if updates.is_empty() {
        return Err(AppError::BadRequest("No fields to update".to_string()));
    }

    query.push_str(&updates.join(", "));
    query.push_str(&format!(" WHERE id = ${} RETURNING *", param_count));

    // Build and execute query
    let mut query_builder = sqlx::query_as::<_, Post>(&query);

    if let Some(title) = &update_data.title {
        query_builder = query_builder.bind(title);
    }
    if let Some(slug) = &update_data.slug {
        query_builder = query_builder.bind(slug);
    }
    if let Some(content) = &update_data.content {
        query_builder = query_builder.bind(content);
    }
    if let Some(excerpt) = &update_data.excerpt {
        query_builder = query_builder.bind(excerpt);
    }
    if let Some(status) = &update_data.status {
        query_builder = query_builder.bind(status);
    }
    if let Some(tags) = &update_data.tags {
        query_builder = query_builder.bind(tags);
    }
    if let Some(featured_image_url) = &update_data.featured_image_url {
        query_builder = query_builder.bind(featured_image_url);
    }
    query_builder = query_builder.bind(post_id);

    let updated_post = query_builder
        .fetch_optional(&pool)
        .await?
        .ok_or_else(|| AppError::NotFound("Post not found".to_string()))?;

    Ok(Json(updated_post))
}

/// Delete a post
///
/// Authors can delete their own posts, admins can delete any post
pub async fn delete_post(
    Extension(pool): Extension<PgPool>,
    Extension(claims): Extension<Claims>,
    Path(post_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>> {
    let user_id = claims
        .user_id()
        .map_err(|_| AppError::Unauthorized("Invalid token".to_string()))?;

    let user_role = UserRole::from_str(&claims.role)
        .map_err(|_| AppError::Unauthorized("Invalid role".to_string()))?;

    // Get existing post
    let existing_post: Option<(Uuid,)> =
        sqlx::query_as("SELECT author_id FROM posts WHERE id = $1")
            .bind(post_id)
            .fetch_optional(&pool)
            .await?;

    let (author_id,) =
        existing_post.ok_or_else(|| AppError::NotFound("Post not found".to_string()))?;

    // Check authorization
    if author_id != user_id && !matches!(user_role, UserRole::Admin) {
        return Err(AppError::Unauthorized(
            "Cannot delete other users' posts".to_string(),
        ));
    }

    // Delete post
    sqlx::query("DELETE FROM posts WHERE id = $1")
        .bind(post_id)
        .execute(&pool)
        .await?;

    Ok(Json(serde_json::json!({
        "message": "Post deleted successfully",
        "post_id": post_id
    })))
}

/// Like a post
pub async fn like_post(
    Extension(pool): Extension<PgPool>,
    Path(post_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>> {
    let result = sqlx::query("UPDATE posts SET like_count = like_count + 1 WHERE id = $1")
        .bind(post_id)
        .execute(&pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Post not found".to_string()));
    }

    let new_count: (i32,) = sqlx::query_as("SELECT like_count FROM posts WHERE id = $1")
        .bind(post_id)
        .fetch_one(&pool)
        .await?;

    Ok(Json(serde_json::json!({
        "message": "Post liked",
        "like_count": new_count.0
    })))
}

/// Search posts by title, content, or tags
pub async fn search_posts(
    Extension(pool): Extension<PgPool>,
    Query(search_params): Query<SearchPostsQuery>,
) -> Result<Json<Vec<Post>>> {
    let limit = search_params.limit.unwrap_or(20).min(100);

    let posts: Vec<Post> = if let Some(tag) = search_params.tag {
        // Search by tag
        sqlx::query_as(
            "SELECT * FROM posts
             WHERE $1 = ANY(tags) AND status = 'published'
             ORDER BY published_at DESC
             LIMIT $2",
        )
        .bind(&tag)
        .bind(limit as i64)
        .fetch_all(&pool)
        .await?
    } else {
        // Full-text search
        sqlx::query_as(
            "SELECT * FROM posts
             WHERE to_tsvector('english', title || ' ' || content) @@ plainto_tsquery('english', $1)
                   AND status = 'published'
             ORDER BY published_at DESC
             LIMIT $2",
        )
        .bind(&search_params.q)
        .bind(limit as i64)
        .fetch_all(&pool)
        .await?
    };

    Ok(Json(posts))
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Generate a URL-friendly slug from a title
fn generate_slug(title: &str) -> String {
    // Convert to lowercase and handle characters
    let normalized: String = title
        .to_lowercase()
        .chars()
        .map(|c| {
            if c.is_alphanumeric() {
                c
            } else if c.is_whitespace() {
                ' ' // Keep whitespace as space
            } else {
                '\0' // Remove special characters
            }
        })
        .filter(|&c| c != '\0') // Remove null characters
        .collect();

    // Split by whitespace and join with hyphens
    // This automatically collapses multiple spaces
    normalized
        .split_whitespace()
        .collect::<Vec<&str>>()
        .join("-")
}

// ============================================================================
// Request/Response Types
// ============================================================================

#[derive(Debug, serde::Deserialize)]
pub struct ListPostsQuery {
    #[serde(flatten)]
    pub pagination: PaginationParams,
    pub status: Option<PostStatus>,
    pub author_id: Option<Uuid>,
}

#[derive(Debug, serde::Deserialize)]
pub struct CreatePostRequest {
    pub title: String,
    pub slug: Option<String>,
    pub content: String,
    pub excerpt: Option<String>,
    pub status: Option<PostStatus>,
    pub tags: Option<Vec<String>>,
    pub featured_image_url: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
pub struct UpdatePostRequest {
    pub title: Option<String>,
    pub slug: Option<String>,
    pub content: Option<String>,
    pub excerpt: Option<String>,
    pub status: Option<PostStatus>,
    pub tags: Option<Vec<String>>,
    pub featured_image_url: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
pub struct SearchPostsQuery {
    pub q: String,
    pub tag: Option<String>,
    pub limit: Option<u32>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_slug() {
        assert_eq!(generate_slug("Hello World"), "hello-world");
        assert_eq!(generate_slug("Rust is Awesome!"), "rust-is-awesome");
        assert_eq!(generate_slug("Multiple   Spaces"), "multiple-spaces");
        assert_eq!(generate_slug("Special@#$Characters"), "specialcharacters");
        assert_eq!(
            generate_slug("  Leading and Trailing  "),
            "leading-and-trailing"
        );
    }

    #[test]
    fn test_create_post_request_deserialization() {
        let json = r#"{
            "title": "My Post",
            "content": "Post content",
            "status": "draft",
            "tags": ["rust", "programming"]
        }"#;
        let req: CreatePostRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.title, "My Post");
        assert_eq!(req.content, "Post content");
        assert_eq!(req.status, Some(PostStatus::Draft));
        assert_eq!(
            req.tags,
            Some(vec!["rust".to_string(), "programming".to_string()])
        );
    }

    #[test]
    fn test_update_post_request_deserialization() {
        let json = r#"{"title": "Updated Title", "status": "published"}"#;
        let req: UpdatePostRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.title, Some("Updated Title".to_string()));
        assert_eq!(req.status, Some(PostStatus::Published));
        assert!(req.content.is_none());
    }

    #[test]
    fn test_search_posts_query_deserialization() {
        let json = r#"{"q": "rust tutorial", "limit": 10}"#;
        let query: SearchPostsQuery = serde_json::from_str(json).unwrap();
        assert_eq!(query.q, "rust tutorial");
        assert_eq!(query.limit, Some(10));
        assert!(query.tag.is_none());
    }
}
