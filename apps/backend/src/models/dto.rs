//! # Data Transfer Objects (DTOs)
//!
//! Request and response types for API endpoints.
//! These types include validation logic and are separate from domain models.

use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

/// Pagination parameters
#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct PaginationParams {
    #[validate(range(min = 1, max = 100))]
    pub page: Option<u32>,

    #[validate(range(min = 1, max = 100))]
    pub per_page: Option<u32>,
}

impl Default for PaginationParams {
    fn default() -> Self {
        Self {
            page: Some(1),
            per_page: Some(20),
        }
    }
}

impl PaginationParams {
    /// Get page number (defaults to 1)
    pub fn page(&self) -> u32 {
        self.page.unwrap_or(1)
    }

    /// Get items per page (defaults to 20)
    pub fn per_page(&self) -> u32 {
        self.per_page.unwrap_or(20)
    }

    /// Calculate offset for database query
    pub fn offset(&self) -> u32 {
        (self.page() - 1) * self.per_page()
    }

    /// Calculate limit for database query
    pub fn limit(&self) -> u32 {
        self.per_page()
    }
}

/// Paginated response wrapper
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaginatedResponse<T> {
    pub data: Vec<T>,
    pub page: u32,
    pub per_page: u32,
    pub total: u64,
    pub total_pages: u32,
}

impl<T> PaginatedResponse<T> {
    /// Create a new paginated response
    pub fn new(data: Vec<T>, page: u32, per_page: u32, total: u64) -> Self {
        let total_pages = ((total as f64) / (per_page as f64)).ceil() as u32;
        Self {
            data,
            page,
            per_page,
            total,
            total_pages,
        }
    }
}

/// Sort order
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SortOrder {
    Asc,
    Desc,
}

impl Default for SortOrder {
    fn default() -> Self {
        SortOrder::Desc
    }
}

/// Generic API response wrapper
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub message: Option<String>,
}

impl<T> ApiResponse<T> {
    /// Create a successful response
    pub fn success(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            message: None,
        }
    }

    /// Create a successful response with a message
    pub fn success_with_message(data: T, message: String) -> Self {
        Self {
            success: true,
            data: Some(data),
            message: Some(message),
        }
    }
}

impl ApiResponse<()> {
    /// Create an error response
    pub fn error(message: String) -> Self {
        Self {
            success: false,
            data: None,
            message: Some(message),
        }
    }
}

/// Error response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorResponse {
    pub error: String,
    pub details: Option<Vec<String>>,
    pub code: Option<String>,
}

impl ErrorResponse {
    /// Create a simple error response
    pub fn new(error: String) -> Self {
        Self {
            error,
            details: None,
            code: None,
        }
    }

    /// Create an error response with details
    pub fn with_details(error: String, details: Vec<String>) -> Self {
        Self {
            error,
            details: Some(details),
            code: None,
        }
    }

    /// Create an error response with a code
    pub fn with_code(error: String, code: String) -> Self {
        Self {
            error,
            details: None,
            code: Some(code),
        }
    }
}

/// ID path parameter
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IdParam {
    pub id: Uuid,
}

/// Search query parameters
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchParams {
    pub q: String,
    #[serde(flatten)]
    pub pagination: PaginationParams,
}

/// Filter parameters for posts
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostFilterParams {
    pub author_id: Option<Uuid>,
    pub status: Option<String>,
    pub tag: Option<String>,
    pub sort_by: Option<String>,
    pub order: Option<SortOrder>,
    #[serde(flatten)]
    pub pagination: PaginationParams,
}

/// Filter parameters for users
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserFilterParams {
    pub role: Option<String>,
    pub is_active: Option<bool>,
    pub search: Option<String>,
    pub sort_by: Option<String>,
    pub order: Option<SortOrder>,
    #[serde(flatten)]
    pub pagination: PaginationParams,
}

/// Bulk operation request
#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct BulkOperationRequest {
    #[validate(length(min = 1, max = 100))]
    pub ids: Vec<Uuid>,
    pub operation: String,
}

/// Bulk operation response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BulkOperationResponse {
    pub success_count: usize,
    pub failure_count: usize,
    pub errors: Vec<String>,
}

/// Health check response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthCheckResponse {
    pub status: String,
    pub timestamp: i64,
    pub database: DatabaseStatus,
    pub version: String,
}

/// Database status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseStatus {
    pub connected: bool,
    pub latency_ms: Option<u64>,
}

/// Statistics response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatsResponse {
    pub total_users: u64,
    pub total_posts: u64,
    pub total_files: u64,
    pub active_sessions: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pagination_params_default() {
        let params = PaginationParams::default();
        assert_eq!(params.page(), 1);
        assert_eq!(params.per_page(), 20);
    }

    #[test]
    fn test_pagination_offset_limit() {
        let params = PaginationParams {
            page: Some(2),
            per_page: Some(10),
        };

        assert_eq!(params.offset(), 10); // (2-1) * 10
        assert_eq!(params.limit(), 10);
    }

    #[test]
    fn test_paginated_response() {
        let data = vec![1, 2, 3];
        let response = PaginatedResponse::new(data, 1, 10, 25);

        assert_eq!(response.page, 1);
        assert_eq!(response.per_page, 10);
        assert_eq!(response.total, 25);
        assert_eq!(response.total_pages, 3); // ceil(25/10)
    }

    #[test]
    fn test_api_response_success() {
        let response = ApiResponse::success("test data");
        assert!(response.success);
        assert_eq!(response.data, Some("test data"));
        assert!(response.message.is_none());
    }

    #[test]
    fn test_api_response_error() {
        let response: ApiResponse<()> = ApiResponse::error("Something went wrong".to_string());
        assert!(!response.success);
        assert!(response.data.is_none());
        assert_eq!(response.message, Some("Something went wrong".to_string()));
    }

    #[test]
    fn test_error_response() {
        let error = ErrorResponse::new("Not found".to_string());
        assert_eq!(error.error, "Not found");
        assert!(error.details.is_none());
        assert!(error.code.is_none());
    }

    #[test]
    fn test_error_response_with_details() {
        let error = ErrorResponse::with_details(
            "Validation failed".to_string(),
            vec![
                "Email is required".to_string(),
                "Password too short".to_string(),
            ],
        );
        assert_eq!(error.details.as_ref().unwrap().len(), 2);
    }

    #[test]
    fn test_error_response_with_code() {
        let error = ErrorResponse::with_code("Not found".to_string(), "NOT_FOUND".to_string());
        assert_eq!(error.code, Some("NOT_FOUND".to_string()));
    }

    #[test]
    fn test_sort_order_default() {
        let order = SortOrder::default();
        assert!(matches!(order, SortOrder::Desc));
    }

    #[test]
    fn test_bulk_operation_response() {
        let response = BulkOperationResponse {
            success_count: 8,
            failure_count: 2,
            errors: vec!["Error 1".to_string()],
        };
        assert_eq!(response.success_count, 8);
        assert_eq!(response.failure_count, 2);
    }
}
