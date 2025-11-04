//! # Middleware Module
//!
//! This module contains middleware for request processing.

pub mod auth;
pub mod error;

// Re-export commonly used middleware
pub use auth::*;
pub use error::*;
