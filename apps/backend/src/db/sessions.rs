//! # Session Repository
//!
//! Data access layer for authentication sessions

use crate::models::Session;
use sqlx::PgPool;
use uuid::Uuid;

/// Session repository for database operations
#[derive(Clone)]
pub struct SessionRepository {
    pool: PgPool,
}

impl SessionRepository {
    /// Create a new session repository
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Find session by ID
    pub async fn find_by_id(&self, id: Uuid) -> Result<Option<Session>, sqlx::Error> {
        sqlx::query_as::<_, Session>("SELECT * FROM sessions WHERE id = $1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await
    }

    /// Find session by refresh token
    pub async fn find_by_refresh_token(&self, token: &str) -> Result<Option<Session>, sqlx::Error> {
        sqlx::query_as::<_, Session>("SELECT * FROM sessions WHERE refresh_token = $1")
            .bind(token)
            .fetch_optional(&self.pool)
            .await
    }

    /// Find all active sessions for a user
    pub async fn find_by_user_id(&self, user_id: Uuid) -> Result<Vec<Session>, sqlx::Error> {
        sqlx::query_as::<_, Session>(
            "SELECT * FROM sessions WHERE user_id = $1 AND is_active = true ORDER BY last_used_at DESC"
        )
        .bind(user_id)
        .fetch_all(&self.pool)
        .await
    }

    /// Create a new session
    pub async fn create(&self, session: &Session) -> Result<Session, sqlx::Error> {
        sqlx::query_as::<_, Session>(
            r#"
            INSERT INTO sessions (id, user_id, refresh_token, ip_address, user_agent,
                                expires_at, created_at, last_used_at, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
            "#,
        )
        .bind(session.id)
        .bind(session.user_id)
        .bind(&session.refresh_token)
        .bind(&session.ip_address)
        .bind(&session.user_agent)
        .bind(session.expires_at)
        .bind(session.created_at)
        .bind(session.last_used_at)
        .bind(session.is_active)
        .fetch_one(&self.pool)
        .await
    }

    /// Update session (typically for updating last_used_at)
    pub async fn update(&self, session: &Session) -> Result<Session, sqlx::Error> {
        sqlx::query_as::<_, Session>(
            r#"
            UPDATE sessions
            SET last_used_at = $2, is_active = $3, expires_at = $4
            WHERE id = $1
            RETURNING *
            "#,
        )
        .bind(session.id)
        .bind(session.last_used_at)
        .bind(session.is_active)
        .bind(session.expires_at)
        .fetch_one(&self.pool)
        .await
    }

    /// Revoke a session
    pub async fn revoke(&self, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE sessions SET is_active = false WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// Revoke all sessions for a user
    pub async fn revoke_all_for_user(&self, user_id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE sessions SET is_active = false WHERE user_id = $1")
            .bind(user_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// Delete expired sessions
    pub async fn delete_expired(&self) -> Result<u64, sqlx::Error> {
        let result = sqlx::query("DELETE FROM sessions WHERE expires_at < NOW()")
            .execute(&self.pool)
            .await?;
        Ok(result.rows_affected())
    }

    /// Count active sessions
    pub async fn count_active(&self) -> Result<i64, sqlx::Error> {
        let (count,): (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM sessions WHERE is_active = true")
                .fetch_one(&self.pool)
                .await?;
        Ok(count)
    }
}
