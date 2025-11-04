//! # User Repository
//!
//! Data access layer for users

use crate::models::{User, UserRole};
use sqlx::PgPool;
use uuid::Uuid;

/// User repository for database operations
#[derive(Clone)]
pub struct UserRepository {
    pool: PgPool,
}

impl UserRepository {
    /// Create a new user repository
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Find user by ID
    pub async fn find_by_id(&self, id: Uuid) -> Result<Option<User>, sqlx::Error> {
        sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = $1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await
    }

    /// Find user by email
    pub async fn find_by_email(&self, email: &str) -> Result<Option<User>, sqlx::Error> {
        sqlx::query_as::<_, User>("SELECT * FROM users WHERE email = $1")
            .bind(email)
            .fetch_optional(&self.pool)
            .await
    }

    /// Create a new user
    pub async fn create(&self, user: &User) -> Result<User, sqlx::Error> {
        sqlx::query_as::<_, User>(
            r#"
            INSERT INTO users (id, email, password_hash, name, avatar_url, email_verified, is_active, role, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *
            "#,
        )
        .bind(user.id)
        .bind(&user.email)
        .bind(&user.password_hash)
        .bind(&user.name)
        .bind(&user.avatar_url)
        .bind(user.email_verified)
        .bind(user.is_active)
        .bind(user.role)
        .bind(user.created_at)
        .bind(user.updated_at)
        .fetch_one(&self.pool)
        .await
    }

    /// Update user
    pub async fn update(&self, user: &User) -> Result<User, sqlx::Error> {
        sqlx::query_as::<_, User>(
            r#"
            UPDATE users
            SET name = $2, avatar_url = $3, email_verified = $4, is_active = $5,
                role = $6, updated_at = $7, last_login_at = $8
            WHERE id = $1
            RETURNING *
            "#,
        )
        .bind(user.id)
        .bind(&user.name)
        .bind(&user.avatar_url)
        .bind(user.email_verified)
        .bind(user.is_active)
        .bind(user.role)
        .bind(user.updated_at)
        .bind(user.last_login_at)
        .fetch_one(&self.pool)
        .await
    }

    /// Delete user (soft delete by setting is_active = false)
    pub async fn delete(&self, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE users SET is_active = false WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// List users with pagination
    pub async fn list(&self, limit: i64, offset: i64) -> Result<Vec<User>, sqlx::Error> {
        sqlx::query_as::<_, User>("SELECT * FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2")
            .bind(limit)
            .bind(offset)
            .fetch_all(&self.pool)
            .await
    }

    /// Count total users
    pub async fn count(&self) -> Result<i64, sqlx::Error> {
        let (count,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users")
            .fetch_one(&self.pool)
            .await?;
        Ok(count)
    }

    /// Search users by name or email
    pub async fn search(
        &self,
        query: &str,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<User>, sqlx::Error> {
        let search_pattern = format!("%{}%", query);
        sqlx::query_as::<_, User>(
            "SELECT * FROM users WHERE name ILIKE $1 OR email ILIKE $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3"
        )
        .bind(search_pattern)
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.pool)
        .await
    }

    /// Filter users by role
    pub async fn find_by_role(
        &self,
        role: UserRole,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<User>, sqlx::Error> {
        sqlx::query_as::<_, User>(
            "SELECT * FROM users WHERE role = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
        )
        .bind(role)
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.pool)
        .await
    }
}
