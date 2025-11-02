//! # Post Repository
//!
//! Data access layer for posts

use crate::models::{Post, PostStatus};
use sqlx::PgPool;
use uuid::Uuid;

/// Post repository for database operations
#[derive(Clone)]
pub struct PostRepository {
    pool: PgPool,
}

impl PostRepository {
    /// Create a new post repository
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Find post by ID
    pub async fn find_by_id(&self, id: Uuid) -> Result<Option<Post>, sqlx::Error> {
        sqlx::query_as::<_, Post>("SELECT * FROM posts WHERE id = $1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await
    }

    /// Find post by slug
    pub async fn find_by_slug(&self, slug: &str) -> Result<Option<Post>, sqlx::Error> {
        sqlx::query_as::<_, Post>("SELECT * FROM posts WHERE slug = $1")
            .bind(slug)
            .fetch_optional(&self.pool)
            .await
    }

    /// Create a new post
    pub async fn create(&self, post: &Post) -> Result<Post, sqlx::Error> {
        sqlx::query_as::<_, Post>(
            r#"
            INSERT INTO posts (id, author_id, title, slug, content, excerpt, featured_image,
                             status, view_count, like_count, comment_count, tags,
                             created_at, updated_at, published_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING *
            "#,
        )
        .bind(post.id)
        .bind(post.author_id)
        .bind(&post.title)
        .bind(&post.slug)
        .bind(&post.content)
        .bind(&post.excerpt)
        .bind(&post.featured_image)
        .bind(post.status)
        .bind(post.view_count)
        .bind(post.like_count)
        .bind(post.comment_count)
        .bind(&post.tags)
        .bind(post.created_at)
        .bind(post.updated_at)
        .bind(post.published_at)
        .fetch_one(&self.pool)
        .await
    }

    /// Update post
    pub async fn update(&self, post: &Post) -> Result<Post, sqlx::Error> {
        sqlx::query_as::<_, Post>(
            r#"
            UPDATE posts
            SET title = $2, slug = $3, content = $4, excerpt = $5, featured_image = $6,
                status = $7, tags = $8, updated_at = $9, published_at = $10
            WHERE id = $1
            RETURNING *
            "#,
        )
        .bind(post.id)
        .bind(&post.title)
        .bind(&post.slug)
        .bind(&post.content)
        .bind(&post.excerpt)
        .bind(&post.featured_image)
        .bind(post.status)
        .bind(&post.tags)
        .bind(post.updated_at)
        .bind(post.published_at)
        .fetch_one(&self.pool)
        .await
    }

    /// Delete post
    pub async fn delete(&self, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM posts WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// List posts with pagination
    pub async fn list(&self, limit: i64, offset: i64) -> Result<Vec<Post>, sqlx::Error> {
        sqlx::query_as::<_, Post>("SELECT * FROM posts ORDER BY created_at DESC LIMIT $1 OFFSET $2")
            .bind(limit)
            .bind(offset)
            .fetch_all(&self.pool)
            .await
    }

    /// List published posts
    pub async fn list_published(&self, limit: i64, offset: i64) -> Result<Vec<Post>, sqlx::Error> {
        sqlx::query_as::<_, Post>(
            "SELECT * FROM posts WHERE status = $1 ORDER BY published_at DESC LIMIT $2 OFFSET $3",
        )
        .bind(PostStatus::Published)
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.pool)
        .await
    }

    /// Find posts by author
    pub async fn find_by_author(
        &self,
        author_id: Uuid,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<Post>, sqlx::Error> {
        sqlx::query_as::<_, Post>(
            "SELECT * FROM posts WHERE author_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
        )
        .bind(author_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.pool)
        .await
    }

    /// Find posts by tag
    pub async fn find_by_tag(
        &self,
        tag: &str,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<Post>, sqlx::Error> {
        sqlx::query_as::<_, Post>(
            "SELECT * FROM posts WHERE $1 = ANY(tags) ORDER BY created_at DESC LIMIT $2 OFFSET $3",
        )
        .bind(tag)
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.pool)
        .await
    }

    /// Search posts by title or content
    pub async fn search(
        &self,
        query: &str,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<Post>, sqlx::Error> {
        let search_pattern = format!("%{}%", query);
        sqlx::query_as::<_, Post>(
            "SELECT * FROM posts WHERE title ILIKE $1 OR content ILIKE $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3"
        )
        .bind(search_pattern)
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.pool)
        .await
    }

    /// Increment view count
    pub async fn increment_views(&self, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE posts SET view_count = view_count + 1 WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// Increment like count
    pub async fn increment_likes(&self, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE posts SET like_count = like_count + 1 WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// Decrement like count
    pub async fn decrement_likes(&self, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// Count total posts
    pub async fn count(&self) -> Result<i64, sqlx::Error> {
        let (count,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM posts")
            .fetch_one(&self.pool)
            .await?;
        Ok(count)
    }
}
