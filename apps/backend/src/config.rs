//! Application configuration module
//!
//! This module handles loading and validating configuration from environment variables.
//! Configuration is loaded once at application startup and passed throughout the app.
//!
//! # Environment Variables
//!
//! Required:
//! - `DATABASE_URL`: PostgreSQL connection string
//! - `JWT_SECRET`: Secret key for JWT token signing
//!
//! Optional:
//! - `HOST`: Server host (default: "127.0.0.1")
//! - `PORT`: Server port (default: "3000")
//! - `JWT_EXPIRATION_HOURS`: Token expiration in hours (default: 24)
//! - `MAX_FILE_SIZE_MB`: Maximum file upload size in MB (default: 10)
//! - `CORS_ORIGIN`: Allowed CORS origin (default: "*")

use std::env;

/// Application configuration
///
/// This struct contains all configuration values needed by the application.
/// Values are loaded from environment variables at startup.
///
/// # Example
///
/// ```no_run
/// use backend::config::Config;
///
/// let config = Config::from_env().expect("Failed to load configuration");
/// println!("Server will run on {}:{}", config.host, config.port);
/// ```
#[derive(Debug, Clone)]
pub struct Config {
    /// Database connection URL (PostgreSQL)
    pub database_url: String,

    /// Server host address
    pub host: String,

    /// Server port
    pub port: u16,

    /// JWT secret key for token signing and verification
    pub jwt_secret: String,

    /// JWT token expiration time in hours
    pub jwt_expiration_hours: i64,

    /// Maximum file upload size in bytes
    pub max_file_size_bytes: usize,

    /// CORS allowed origin
    #[allow(dead_code)]
    pub cors_origin: String,

    /// Application environment (development, production, test)
    pub environment: Environment,
}

/// Application environment type
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Environment {
    /// Development environment
    Development,
    /// Production environment
    Production,
    /// Test environment
    Test,
}

#[allow(dead_code)]
impl Environment {
    /// Check if running in development mode
    pub fn is_development(&self) -> bool {
        matches!(self, Environment::Development)
    }

    /// Check if running in production mode
    pub fn is_production(&self) -> bool {
        matches!(self, Environment::Production)
    }

    /// Check if running in test mode
    pub fn is_test(&self) -> bool {
        matches!(self, Environment::Test)
    }
}

impl std::fmt::Display for Environment {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Environment::Development => write!(f, "development"),
            Environment::Production => write!(f, "production"),
            Environment::Test => write!(f, "test"),
        }
    }
}

impl std::str::FromStr for Environment {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "development" | "dev" => Ok(Environment::Development),
            "production" | "prod" => Ok(Environment::Production),
            "test" => Ok(Environment::Test),
            _ => Err(format!("Invalid environment: {}", s)),
        }
    }
}

/// Configuration loading errors
#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    /// Missing required environment variable
    #[error("Missing required environment variable: {0}")]
    MissingVariable(String),

    /// Invalid value for environment variable
    #[error("Invalid value for {0}: {1}")]
    InvalidValue(String, String),

    /// General environment error
    #[error("Environment error: {0}")]
    EnvError(#[from] env::VarError),
}

impl Config {
    /// Load configuration from environment variables
    ///
    /// This function reads environment variables and constructs a Config instance.
    /// Returns an error if required variables are missing or invalid.
    ///
    /// # Errors
    ///
    /// Returns `ConfigError` if:
    /// - Required environment variables are missing
    /// - Environment variable values are invalid (e.g., port is not a number)
    ///
    /// # Example
    ///
    /// ```no_run
    /// use backend::config::Config;
    ///
    /// match Config::from_env() {
    ///     Ok(config) => println!("Configuration loaded successfully"),
    ///     Err(e) => eprintln!("Failed to load configuration: {}", e),
    /// }
    /// ```
    pub fn from_env() -> Result<Self, ConfigError> {
        // Load .env file if it exists (ignored in production)
        dotenvy::dotenv().ok();

        // Required variables
        let database_url = env::var("DATABASE_URL")
            .map_err(|_| ConfigError::MissingVariable("DATABASE_URL".to_string()))?;

        let jwt_secret = env::var("JWT_SECRET")
            .map_err(|_| ConfigError::MissingVariable("JWT_SECRET".to_string()))?;

        // Optional variables with defaults
        let host = env::var("HOST").unwrap_or_else(|_| "127.0.0.1".to_string());

        let port = env::var("PORT")
            .unwrap_or_else(|_| "3000".to_string())
            .parse::<u16>()
            .map_err(|e| ConfigError::InvalidValue("PORT".to_string(), e.to_string()))?;

        let jwt_expiration_hours = env::var("JWT_EXPIRATION_HOURS")
            .unwrap_or_else(|_| "24".to_string())
            .parse::<i64>()
            .map_err(|e| {
                ConfigError::InvalidValue("JWT_EXPIRATION_HOURS".to_string(), e.to_string())
            })?;

        let max_file_size_mb = env::var("MAX_FILE_SIZE_MB")
            .unwrap_or_else(|_| "10".to_string())
            .parse::<usize>()
            .map_err(|e| {
                ConfigError::InvalidValue("MAX_FILE_SIZE_MB".to_string(), e.to_string())
            })?;

        let max_file_size_bytes = max_file_size_mb * 1024 * 1024;

        let cors_origin = env::var("CORS_ORIGIN").unwrap_or_else(|_| "*".to_string());

        let environment = env::var("APP_ENV")
            .or_else(|_| env::var("ENVIRONMENT"))
            .unwrap_or_else(|_| "development".to_string())
            .parse::<Environment>()
            .map_err(|e| ConfigError::InvalidValue("APP_ENV".to_string(), e))?;

        Ok(Self {
            database_url,
            host,
            port,
            jwt_secret,
            jwt_expiration_hours,
            max_file_size_bytes,
            cors_origin,
            environment,
        })
    }

    /// Get the full server address (host:port)
    ///
    /// # Example
    ///
    /// ```no_run
    /// use backend::config::Config;
    ///
    /// let config = Config::from_env().unwrap();
    /// println!("Server address: {}", config.server_address());
    /// // Output: "Server address: 127.0.0.1:3000"
    /// ```
    pub fn server_address(&self) -> String {
        format!("{}:{}", self.host, self.port)
    }

    /// Validate configuration values
    ///
    /// Performs additional validation beyond type checking.
    /// Useful for catching configuration errors early.
    ///
    /// # Errors
    ///
    /// Returns `ConfigError` if validation fails.
    pub fn validate(&self) -> Result<(), ConfigError> {
        // Validate JWT secret length (should be at least 32 characters)
        if self.jwt_secret.len() < 32 {
            return Err(ConfigError::InvalidValue(
                "JWT_SECRET".to_string(),
                "Secret must be at least 32 characters long for security".to_string(),
            ));
        }

        // Validate JWT expiration is positive
        if self.jwt_expiration_hours <= 0 {
            return Err(ConfigError::InvalidValue(
                "JWT_EXPIRATION_HOURS".to_string(),
                "Expiration must be positive".to_string(),
            ));
        }

        // Validate max file size is reasonable (not more than 1GB)
        if self.max_file_size_bytes > 1024 * 1024 * 1024 {
            return Err(ConfigError::InvalidValue(
                "MAX_FILE_SIZE_MB".to_string(),
                "Maximum file size cannot exceed 1024 MB (1 GB)".to_string(),
            ));
        }

        // Validate database URL format (basic check)
        if !self.database_url.starts_with("postgres://")
            && !self.database_url.starts_with("postgresql://")
        {
            return Err(ConfigError::InvalidValue(
                "DATABASE_URL".to_string(),
                "Must be a valid PostgreSQL connection string".to_string(),
            ));
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;
    use std::env;

    /// Helper to set test environment variables
    fn setup_test_env() {
        unsafe {
            env::set_var("DATABASE_URL", "postgresql://localhost/test_db");
            env::set_var(
                "JWT_SECRET",
                "test_secret_key_with_at_least_32_chars_for_security",
            );
            env::set_var("HOST", "0.0.0.0");
            env::set_var("PORT", "8080");
            env::set_var("JWT_EXPIRATION_HOURS", "48");
            env::set_var("MAX_FILE_SIZE_MB", "20");
            env::set_var("CORS_ORIGIN", "https://example.com");
            env::set_var("APP_ENV", "test");
        }
    }

    #[test]
    #[serial]
    fn test_config_from_env() {
        setup_test_env();
        let config = Config::from_env().expect("Should load config");

        assert_eq!(config.database_url, "postgresql://localhost/test_db");
        assert_eq!(config.host, "0.0.0.0");
        assert_eq!(config.port, 8080);
        assert_eq!(config.jwt_expiration_hours, 48);
        assert_eq!(config.max_file_size_bytes, 20 * 1024 * 1024);
        assert_eq!(config.cors_origin, "https://example.com");
        assert!(config.environment.is_test());
    }

    #[test]
    fn test_environment_parsing() {
        assert_eq!(
            "development".parse::<Environment>().unwrap(),
            Environment::Development
        );
        assert_eq!(
            "dev".parse::<Environment>().unwrap(),
            Environment::Development
        );
        assert_eq!(
            "production".parse::<Environment>().unwrap(),
            Environment::Production
        );
        assert_eq!(
            "prod".parse::<Environment>().unwrap(),
            Environment::Production
        );
        assert_eq!("test".parse::<Environment>().unwrap(), Environment::Test);
        assert!("invalid".parse::<Environment>().is_err());
    }

    #[test]
    #[serial]
    fn test_server_address() {
        setup_test_env();
        let config = Config::from_env().unwrap();
        assert_eq!(config.server_address(), "0.0.0.0:8080");
    }

    #[test]
    #[serial]
    fn test_validation_short_jwt_secret() {
        setup_test_env();
        unsafe {
            env::set_var("JWT_SECRET", "short");
        }
        let config = Config::from_env().unwrap();
        assert!(config.validate().is_err());
    }

    #[test]
    #[serial]
    fn test_validation_negative_expiration() {
        setup_test_env();
        unsafe {
            env::set_var("JWT_EXPIRATION_HOURS", "-1");
        }
        let config = Config::from_env().unwrap();
        assert!(config.validate().is_err());
    }

    #[test]
    #[serial]
    fn test_validation_large_file_size() {
        setup_test_env();
        unsafe {
            env::set_var("MAX_FILE_SIZE_MB", "2000");
        }
        let config = Config::from_env().unwrap();
        assert!(config.validate().is_err());
    }

    #[test]
    #[serial]
    fn test_validation_invalid_database_url() {
        setup_test_env();
        unsafe {
            env::set_var("DATABASE_URL", "mysql://localhost/test");
        }
        let config = Config::from_env().unwrap();
        assert!(config.validate().is_err());
    }

    #[test]
    fn test_environment_methods() {
        assert!(Environment::Development.is_development());
        assert!(!Environment::Development.is_production());
        assert!(!Environment::Development.is_test());

        assert!(!Environment::Production.is_development());
        assert!(Environment::Production.is_production());
        assert!(!Environment::Production.is_test());

        assert!(!Environment::Test.is_development());
        assert!(!Environment::Test.is_production());
        assert!(Environment::Test.is_test());
    }
}
