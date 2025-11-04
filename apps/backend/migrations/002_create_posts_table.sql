-- Migration: Create posts table and post_status enum
-- Description: Sets up blog/content management system
-- Created: 2025-01-03

-- Create post_status enum type
CREATE TYPE post_status AS ENUM ('draft', 'published', 'archived');

-- Create posts table
CREATE TABLE posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id UUID NOT NULL,
    title VARCHAR(500) NOT NULL,
    slug VARCHAR(500) NOT NULL UNIQUE,
    content TEXT NOT NULL,
    excerpt TEXT,
    status post_status NOT NULL DEFAULT 'draft',
    view_count INTEGER NOT NULL DEFAULT 0,
    like_count INTEGER NOT NULL DEFAULT 0,
    tags TEXT[] NOT NULL DEFAULT '{}',
    featured_image_url TEXT,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Foreign key to users table
    CONSTRAINT fk_posts_author FOREIGN KEY (author_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    -- Constraints
    CONSTRAINT title_not_empty CHECK (length(trim(title)) > 0),
    CONSTRAINT slug_format CHECK (slug ~* '^[a-z0-9-]+$'),
    CONSTRAINT view_count_positive CHECK (view_count >= 0),
    CONSTRAINT like_count_positive CHECK (like_count >= 0),
    CONSTRAINT published_at_with_status CHECK (
        (status = 'published' AND published_at IS NOT NULL) OR
        (status != 'published' AND published_at IS NULL)
    )
);

-- Create indexes for better query performance
CREATE INDEX idx_posts_author_id ON posts(author_id);
CREATE INDEX idx_posts_slug ON posts(slug);
CREATE INDEX idx_posts_status ON posts(status);
CREATE INDEX idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX idx_posts_published_at ON posts(published_at DESC) WHERE published_at IS NOT NULL;
CREATE INDEX idx_posts_tags ON posts USING GIN(tags);

-- Create full-text search index for title and content
CREATE INDEX idx_posts_search ON posts USING GIN(
    to_tsvector('english', title || ' ' || content)
);

-- Add trigger to automatically update updated_at
CREATE TRIGGER posts_updated_at
    BEFORE UPDATE ON posts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add trigger to set published_at when status changes to published
CREATE OR REPLACE FUNCTION set_published_at()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'published' AND OLD.status != 'published' AND NEW.published_at IS NULL THEN
        NEW.published_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER posts_set_published_at
    BEFORE UPDATE ON posts
    FOR EACH ROW
    EXECUTE FUNCTION set_published_at();

-- Add comments for documentation
COMMENT ON TABLE posts IS 'Blog posts and content management';
COMMENT ON COLUMN posts.id IS 'Primary key - UUID v4';
COMMENT ON COLUMN posts.author_id IS 'Foreign key to users table';
COMMENT ON COLUMN posts.title IS 'Post title (max 500 chars)';
COMMENT ON COLUMN posts.slug IS 'URL-friendly identifier (lowercase, hyphens only)';
COMMENT ON COLUMN posts.content IS 'Full post content (supports Markdown)';
COMMENT ON COLUMN posts.excerpt IS 'Short summary for listings';
COMMENT ON COLUMN posts.status IS 'Publication status: draft, published, or archived';
COMMENT ON COLUMN posts.view_count IS 'Number of times post has been viewed';
COMMENT ON COLUMN posts.like_count IS 'Number of likes/favorites';
COMMENT ON COLUMN posts.tags IS 'Array of tags for categorization';
COMMENT ON COLUMN posts.featured_image_url IS 'URL to featured/cover image';
COMMENT ON COLUMN posts.published_at IS 'When post was first published';
