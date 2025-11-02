//! # Post Model
//!
//! Domain model representing a blog post or content item.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

/// Post model representing a blog post or article
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Post {
    /// Unique post identifier
    pub id: Uuid,

    /// Author's user ID
    pub author_id: Uuid,

    /// Post title
    pub title: String,

    /// Post slug for URLs (unique)
    pub slug: String,

    /// Post content (markdown or HTML)
    pub content: String,

    /// Optional excerpt/summary
    pub excerpt: Option<String>,

    /// Featured image URL
    pub featured_image: Option<String>,

    /// Post status
    pub status: PostStatus,

    /// View count
    pub view_count: i32,

    /// Like count
    pub like_count: i32,

    /// Comment count
    pub comment_count: i32,

    /// Tags associated with the post
    #[sqlx(default)]
    pub tags: Vec<String>,

    /// When the post was created
    pub created_at: DateTime<Utc>,

    /// When the post was last updated
    pub updated_at: DateTime<Utc>,

    /// When the post was published (null for drafts)
    pub published_at: Option<DateTime<Utc>>,
}

/// Post status enumeration
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, sqlx::Type)]
#[sqlx(type_name = "post_status", rename_all = "lowercase")]
pub enum PostStatus {
    #[serde(rename = "draft")]
    Draft,
    #[serde(rename = "published")]
    Published,
    #[serde(rename = "archived")]
    Archived,
}

impl std::fmt::Display for PostStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PostStatus::Draft => write!(f, "draft"),
            PostStatus::Published => write!(f, "published"),
            PostStatus::Archived => write!(f, "archived"),
        }
    }
}

impl Post {
    /// Create a new draft post
    pub fn new(author_id: Uuid, title: String, content: String) -> Self {
        let now = Utc::now();
        let slug = slugify(&title);

        Self {
            id: Uuid::new_v4(),
            author_id,
            title,
            slug,
            content,
            excerpt: None,
            featured_image: None,
            status: PostStatus::Draft,
            view_count: 0,
            like_count: 0,
            comment_count: 0,
            tags: Vec::new(),
            created_at: now,
            updated_at: now,
            published_at: None,
        }
    }

    /// Publish the post
    pub fn publish(&mut self) {
        if self.status != PostStatus::Published {
            self.status = PostStatus::Published;
            self.published_at = Some(Utc::now());
            self.updated_at = Utc::now();
        }
    }

    /// Unpublish the post (revert to draft)
    pub fn unpublish(&mut self) {
        self.status = PostStatus::Draft;
        self.published_at = None;
        self.updated_at = Utc::now();
    }

    /// Archive the post
    pub fn archive(&mut self) {
        self.status = PostStatus::Archived;
        self.updated_at = Utc::now();
    }

    /// Check if the post is published
    pub fn is_published(&self) -> bool {
        self.status == PostStatus::Published
    }

    /// Check if the post is a draft
    pub fn is_draft(&self) -> bool {
        self.status == PostStatus::Draft
    }

    /// Increment view count
    pub fn increment_views(&mut self) {
        self.view_count += 1;
    }

    /// Increment like count
    pub fn increment_likes(&mut self) {
        self.like_count += 1;
    }

    /// Decrement like count
    pub fn decrement_likes(&mut self) {
        if self.like_count > 0 {
            self.like_count -= 1;
        }
    }

    /// Update tags
    pub fn set_tags(&mut self, tags: Vec<String>) {
        self.tags = tags;
        self.updated_at = Utc::now();
    }

    /// Generate excerpt from content if not set
    pub fn ensure_excerpt(&mut self, max_length: usize) {
        if self.excerpt.is_none() {
            let excerpt = if self.content.len() > max_length {
                format!("{}...", &self.content[..max_length])
            } else {
                self.content.clone()
            };
            self.excerpt = Some(excerpt);
        }
    }
}

/// Post summary for list views
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostSummary {
    pub id: Uuid,
    pub author_id: Uuid,
    pub title: String,
    pub slug: String,
    pub excerpt: Option<String>,
    pub featured_image: Option<String>,
    pub status: PostStatus,
    pub view_count: i32,
    pub like_count: i32,
    pub comment_count: i32,
    pub tags: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub published_at: Option<DateTime<Utc>>,
}

impl From<Post> for PostSummary {
    fn from(post: Post) -> Self {
        Self {
            id: post.id,
            author_id: post.author_id,
            title: post.title,
            slug: post.slug,
            excerpt: post.excerpt,
            featured_image: post.featured_image,
            status: post.status,
            view_count: post.view_count,
            like_count: post.like_count,
            comment_count: post.comment_count,
            tags: post.tags,
            created_at: post.created_at,
            published_at: post.published_at,
        }
    }
}

/// Create post request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePost {
    pub title: String,
    pub content: String,
    pub excerpt: Option<String>,
    pub featured_image: Option<String>,
    pub tags: Option<Vec<String>>,
}

/// Update post request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdatePost {
    pub title: Option<String>,
    pub content: Option<String>,
    pub excerpt: Option<String>,
    pub featured_image: Option<String>,
    pub tags: Option<Vec<String>>,
}

impl UpdatePost {
    /// Check if the update contains any changes
    pub fn has_changes(&self) -> bool {
        self.title.is_some()
            || self.content.is_some()
            || self.excerpt.is_some()
            || self.featured_image.is_some()
            || self.tags.is_some()
    }

    /// Apply updates to a post
    pub fn apply_to(&self, post: &mut Post) {
        if let Some(ref title) = self.title {
            post.title = title.clone();
            post.slug = slugify(title);
        }
        if let Some(ref content) = self.content {
            post.content = content.clone();
        }
        if let Some(ref excerpt) = self.excerpt {
            post.excerpt = Some(excerpt.clone());
        }
        if let Some(ref featured_image) = self.featured_image {
            post.featured_image = Some(featured_image.clone());
        }
        if let Some(ref tags) = self.tags {
            post.tags = tags.clone();
        }
        post.updated_at = Utc::now();
    }
}

/// Generate a URL-friendly slug from a title
fn slugify(text: &str) -> String {
    text.to_lowercase()
        .chars()
        .map(|c| {
            if c.is_alphanumeric() {
                c
            } else if c.is_whitespace() {
                '-'
            } else {
                '\0'
            }
        })
        .filter(|&c| c != '\0')
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<&str>>()
        .join("-")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_post_creation() {
        let author_id = Uuid::new_v4();
        let post = Post::new(
            author_id,
            "Test Post".to_string(),
            "This is test content".to_string(),
        );

        assert_eq!(post.title, "Test Post");
        assert_eq!(post.slug, "test-post");
        assert_eq!(post.status, PostStatus::Draft);
        assert!(post.is_draft());
        assert!(!post.is_published());
    }

    #[test]
    fn test_publish_post() {
        let author_id = Uuid::new_v4();
        let mut post = Post::new(author_id, "Test Post".to_string(), "Content".to_string());

        post.publish();
        assert!(post.is_published());
        assert!(post.published_at.is_some());
    }

    #[test]
    fn test_unpublish_post() {
        let author_id = Uuid::new_v4();
        let mut post = Post::new(author_id, "Test Post".to_string(), "Content".to_string());

        post.publish();
        post.unpublish();
        assert!(post.is_draft());
        assert!(post.published_at.is_none());
    }

    #[test]
    fn test_increment_views() {
        let author_id = Uuid::new_v4();
        let mut post = Post::new(author_id, "Test Post".to_string(), "Content".to_string());

        assert_eq!(post.view_count, 0);
        post.increment_views();
        assert_eq!(post.view_count, 1);
    }

    #[test]
    fn test_like_count() {
        let author_id = Uuid::new_v4();
        let mut post = Post::new(author_id, "Test Post".to_string(), "Content".to_string());

        post.increment_likes();
        assert_eq!(post.like_count, 1);
        post.decrement_likes();
        assert_eq!(post.like_count, 0);
        post.decrement_likes(); // Should not go negative
        assert_eq!(post.like_count, 0);
    }

    #[test]
    fn test_slugify() {
        assert_eq!(slugify("Hello World"), "hello-world");
        assert_eq!(slugify("Rust is Great!"), "rust-is-great");
        assert_eq!(slugify("Multiple   Spaces"), "multiple-spaces");
        assert_eq!(slugify("Special@#$Characters"), "specialcharacters");
    }

    #[test]
    fn test_ensure_excerpt() {
        let author_id = Uuid::new_v4();
        let mut post = Post::new(
            author_id,
            "Test Post".to_string(),
            "This is a very long content that should be truncated for the excerpt".to_string(),
        );

        post.ensure_excerpt(20);
        assert!(post.excerpt.is_some());
        assert!(post.excerpt.unwrap().len() <= 23); // 20 + "..."
    }

    #[test]
    fn test_update_post() {
        let author_id = Uuid::new_v4();
        let mut post = Post::new(
            author_id,
            "Old Title".to_string(),
            "Old Content".to_string(),
        );

        let update = UpdatePost {
            title: Some("New Title".to_string()),
            content: Some("New Content".to_string()),
            excerpt: None,
            featured_image: None,
            tags: Some(vec!["rust".to_string(), "backend".to_string()]),
        };

        assert!(update.has_changes());
        update.apply_to(&mut post);

        assert_eq!(post.title, "New Title");
        assert_eq!(post.content, "New Content");
        assert_eq!(post.tags, vec!["rust", "backend"]);
    }
}
