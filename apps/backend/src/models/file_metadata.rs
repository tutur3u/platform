//! # File Metadata Model
//!
//! Models for tracking uploaded files and their metadata.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

/// File metadata model
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct FileMetadata {
    /// Unique file identifier
    pub id: Uuid,

    /// User who uploaded the file
    pub user_id: Uuid,

    /// Original filename
    pub filename: String,

    /// Stored filename (may be different from original)
    pub stored_filename: String,

    /// MIME type
    pub mime_type: String,

    /// File size in bytes
    pub size_bytes: i64,

    /// Storage path or URL
    pub storage_path: String,

    /// File hash (for deduplication)
    pub file_hash: Option<String>,

    /// Whether the file is public
    pub is_public: bool,

    /// Number of times the file was downloaded
    pub download_count: i32,

    /// Additional metadata (JSON)
    #[sqlx(default)]
    pub metadata: Option<serde_json::Value>,

    /// When the file was uploaded
    pub created_at: DateTime<Utc>,

    /// When the metadata was last updated
    pub updated_at: DateTime<Utc>,

    /// When the file expires (for temporary files)
    pub expires_at: Option<DateTime<Utc>>,
}

#[allow(dead_code)]
impl FileMetadata {
    /// Create new file metadata
    pub fn new(
        user_id: Uuid,
        filename: String,
        mime_type: String,
        size_bytes: i64,
        storage_path: String,
    ) -> Self {
        let now = Utc::now();
        let stored_filename = format!("{}_{}", Uuid::new_v4(), filename);

        Self {
            id: Uuid::new_v4(),
            user_id,
            filename,
            stored_filename,
            mime_type,
            size_bytes,
            storage_path,
            file_hash: None,
            is_public: false,
            download_count: 0,
            metadata: None,
            created_at: now,
            updated_at: now,
            expires_at: None,
        }
    }

    /// Check if the file is expired
    pub fn is_expired(&self) -> bool {
        if let Some(expires_at) = self.expires_at {
            Utc::now() > expires_at
        } else {
            false
        }
    }

    /// Increment download count
    pub fn increment_downloads(&mut self) {
        self.download_count += 1;
        self.updated_at = Utc::now();
    }

    /// Make the file public
    pub fn make_public(&mut self) {
        self.is_public = true;
        self.updated_at = Utc::now();
    }

    /// Make the file private
    pub fn make_private(&mut self) {
        self.is_public = false;
        self.updated_at = Utc::now();
    }

    /// Get file extension
    pub fn extension(&self) -> Option<&str> {
        self.filename
            .rfind('.')
            .map(|pos| &self.filename[pos + 1..])
    }

    /// Check if file is an image
    pub fn is_image(&self) -> bool {
        self.mime_type.starts_with("image/")
    }

    /// Check if file is a video
    pub fn is_video(&self) -> bool {
        self.mime_type.starts_with("video/")
    }

    /// Check if file is a document
    pub fn is_document(&self) -> bool {
        matches!(
            self.mime_type.as_str(),
            "application/pdf"
                | "application/msword"
                | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                | "text/plain"
        )
    }

    /// Get human-readable file size
    pub fn human_readable_size(&self) -> String {
        let size = self.size_bytes as f64;
        if size < 1024.0 {
            format!("{} B", size)
        } else if size < 1024.0 * 1024.0 {
            format!("{:.2} KB", size / 1024.0)
        } else if size < 1024.0 * 1024.0 * 1024.0 {
            format!("{:.2} MB", size / (1024.0 * 1024.0))
        } else {
            format!("{:.2} GB", size / (1024.0 * 1024.0 * 1024.0))
        }
    }
}

/// File upload response
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileUploadResponse {
    pub id: Uuid,
    pub filename: String,
    pub mime_type: String,
    pub size_bytes: i64,
    pub url: String,
    pub created_at: DateTime<Utc>,
}

impl From<FileMetadata> for FileUploadResponse {
    fn from(metadata: FileMetadata) -> Self {
        Self {
            id: metadata.id,
            filename: metadata.filename,
            mime_type: metadata.mime_type,
            size_bytes: metadata.size_bytes,
            url: metadata.storage_path,
            created_at: metadata.created_at,
        }
    }
}

/// File summary for lists
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileSummary {
    pub id: Uuid,
    pub filename: String,
    pub mime_type: String,
    pub size_bytes: i64,
    pub human_readable_size: String,
    pub is_public: bool,
    pub download_count: i32,
    pub created_at: DateTime<Utc>,
}

impl From<FileMetadata> for FileSummary {
    fn from(metadata: FileMetadata) -> Self {
        let human_readable_size = metadata.human_readable_size();
        Self {
            id: metadata.id,
            filename: metadata.filename,
            mime_type: metadata.mime_type,
            size_bytes: metadata.size_bytes,
            human_readable_size,
            is_public: metadata.is_public,
            download_count: metadata.download_count,
            created_at: metadata.created_at,
        }
    }
}

/// Signed upload URL request
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignedUploadRequest {
    pub filename: String,
    pub mime_type: String,
    pub size_bytes: i64,
}

/// Signed upload URL response
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignedUploadResponse {
    pub upload_url: String,
    pub file_id: Uuid,
    pub expires_at: DateTime<Utc>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_file_metadata_creation() {
        let user_id = Uuid::new_v4();
        let file = FileMetadata::new(
            user_id,
            "test.pdf".to_string(),
            "application/pdf".to_string(),
            1024,
            "/files/test.pdf".to_string(),
        );

        assert_eq!(file.filename, "test.pdf");
        assert_eq!(file.mime_type, "application/pdf");
        assert_eq!(file.size_bytes, 1024);
        assert!(!file.is_public);
    }

    #[test]
    fn test_file_extension() {
        let user_id = Uuid::new_v4();
        let file = FileMetadata::new(
            user_id,
            "document.pdf".to_string(),
            "application/pdf".to_string(),
            1024,
            "/path".to_string(),
        );

        assert_eq!(file.extension(), Some("pdf"));
    }

    #[test]
    fn test_file_type_checks() {
        let user_id = Uuid::new_v4();

        let image = FileMetadata::new(
            user_id,
            "image.jpg".to_string(),
            "image/jpeg".to_string(),
            1024,
            "/path".to_string(),
        );
        assert!(image.is_image());
        assert!(!image.is_video());
        assert!(!image.is_document());

        let video = FileMetadata::new(
            user_id,
            "video.mp4".to_string(),
            "video/mp4".to_string(),
            1024,
            "/path".to_string(),
        );
        assert!(video.is_video());
        assert!(!video.is_image());

        let pdf = FileMetadata::new(
            user_id,
            "doc.pdf".to_string(),
            "application/pdf".to_string(),
            1024,
            "/path".to_string(),
        );
        assert!(pdf.is_document());
        assert!(!pdf.is_image());
    }

    #[test]
    fn test_human_readable_size() {
        let user_id = Uuid::new_v4();

        let file1 = FileMetadata::new(
            user_id,
            "small.txt".to_string(),
            "text/plain".to_string(),
            512,
            "/path".to_string(),
        );
        assert_eq!(file1.human_readable_size(), "512 B");

        let file2 = FileMetadata::new(
            user_id,
            "medium.txt".to_string(),
            "text/plain".to_string(),
            1024 * 10,
            "/path".to_string(),
        );
        assert!(file2.human_readable_size().contains("KB"));

        let file3 = FileMetadata::new(
            user_id,
            "large.txt".to_string(),
            "text/plain".to_string(),
            1024 * 1024 * 5,
            "/path".to_string(),
        );
        assert!(file3.human_readable_size().contains("MB"));
    }

    #[test]
    fn test_increment_downloads() {
        let user_id = Uuid::new_v4();
        let mut file = FileMetadata::new(
            user_id,
            "test.pdf".to_string(),
            "application/pdf".to_string(),
            1024,
            "/path".to_string(),
        );

        assert_eq!(file.download_count, 0);
        file.increment_downloads();
        assert_eq!(file.download_count, 1);
    }

    #[test]
    fn test_make_public_private() {
        let user_id = Uuid::new_v4();
        let mut file = FileMetadata::new(
            user_id,
            "test.pdf".to_string(),
            "application/pdf".to_string(),
            1024,
            "/path".to_string(),
        );

        assert!(!file.is_public);
        file.make_public();
        assert!(file.is_public);
        file.make_private();
        assert!(!file.is_public);
    }

    #[test]
    fn test_file_expiration() {
        let user_id = Uuid::new_v4();
        let mut file = FileMetadata::new(
            user_id,
            "temp.txt".to_string(),
            "text/plain".to_string(),
            1024,
            "/path".to_string(),
        );

        assert!(!file.is_expired());

        file.expires_at = Some(Utc::now() - chrono::Duration::hours(1));
        assert!(file.is_expired());
    }
}
