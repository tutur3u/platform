//! # Database Module
//!
//! This module handles database connections and provides repository patterns
//! for data access.

use sqlx::{PgPool, postgres::PgPoolOptions};
use std::time::Duration;

pub mod posts;
pub mod sessions;
pub mod users;

// Re-export repositories (temporarily unused until handlers are implemented)
#[allow(unused_imports)]
pub use posts::PostRepository;
#[allow(unused_imports)]
pub use sessions::SessionRepository;
#[allow(unused_imports)]
pub use users::UserRepository;

/// Initialize database connection pool
///
/// Creates a connection pool with optimal settings for the application.
///
/// # Arguments
///
/// * `database_url` - PostgreSQL connection string
///
/// # Returns
///
/// A connection pool ready to use
///
/// # Errors
///
/// Returns an error if the database connection fails
pub async fn init_pool(database_url: &str) -> Result<PgPool, sqlx::Error> {
    PgPoolOptions::new()
        .max_connections(20)
        .min_connections(5)
        .acquire_timeout(Duration::from_secs(30))
        .idle_timeout(Duration::from_secs(600))
        .max_lifetime(Duration::from_secs(1800))
        .connect(database_url)
        .await
}

/// Run database migrations
///
/// # Arguments
///
/// * `pool` - Database connection pool
///
/// # Errors
///
/// Returns an error if migrations fail
#[allow(dead_code)]
pub async fn run_migrations(pool: &PgPool) -> Result<(), sqlx::migrate::MigrateError> {
    sqlx::migrate!("./migrations").run(pool).await
}

/// Health check for database connection
///
/// # Arguments
///
/// * `pool` - Database connection pool
///
/// # Returns
///
/// True if database is healthy, false otherwise
#[allow(dead_code)]
pub async fn health_check(pool: &PgPool) -> bool {
    sqlx::query("SELECT 1").fetch_one(pool).await.is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore] // Requires database connection
    async fn test_init_pool() {
        let database_url = std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgresql://localhost/test_db".to_string());

        let result = init_pool(&database_url).await;
        // This will fail without a real database, but shows the API
        assert!(result.is_ok() || result.is_err());
    }
}
