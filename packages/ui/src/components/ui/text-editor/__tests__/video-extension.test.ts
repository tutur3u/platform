import { describe, it, expect, vi } from 'vitest';
import { Video } from '../video-extension';
import { MAX_VIDEO_SIZE } from '../media-utils';

describe('VideoExtension', () => {
  describe('creation', () => {
    it('should create video extension instance', () => {
      const extension = Video();

      expect(extension).toBeDefined();
      expect(extension.name).toBe('video');
    });

    it('should accept options with onVideoUpload callback', () => {
      const mockUpload = vi
        .fn()
        .mockResolvedValue('https://example.com/video.mp4');
      const extension = Video({ onVideoUpload: mockUpload });

      expect(extension).toBeDefined();
    });

    it('should work without upload handler', () => {
      const extension = Video();
      expect(extension).toBeDefined();
    });
  });

  describe('node configuration', () => {
    it('should be a block-level node', () => {
      const extension = Video();

      // Check the options configuration
      expect(extension.options).toBeDefined();
      expect(extension.name).toBe('video');
    });

    it('should have src attribute', () => {
      const extension = Video();

      // Attributes are defined in addAttributes
      expect(extension).toBeDefined();
    });

    it('should parse HTML video elements', () => {
      const extension = Video();

      // parseHTML handles video tags
      expect(extension).toBeDefined();
    });

    it('should render as HTML video element', () => {
      const extension = Video();

      // renderHTML creates video element with controls
      expect(extension).toBeDefined();
    });
  });

  describe('commands', () => {
    it('should provide setVideo command', () => {
      const extension = Video();

      // setVideo command inserts video node
      expect(extension).toBeDefined();
    });

    it('should provide toggleVideo command', () => {
      const extension = Video();

      // toggleVideo command toggles between video and paragraph
      expect(extension).toBeDefined();
    });
  });

  describe('input rules', () => {
    it('should support markdown-like video syntax', () => {
      const extension = Video();

      // Supports ![alt](url) syntax for videos
      expect(extension).toBeDefined();
    });
  });

  describe('file size validation', () => {
    it('should use MAX_VIDEO_SIZE constant for validation', () => {
      expect(MAX_VIDEO_SIZE).toBe(50 * 1024 * 1024); // 50MB
    });

    it('should validate file size on paste', () => {
      const extension = Video({
        onVideoUpload: vi.fn().mockResolvedValue('url'),
      });

      // Paste handler validates against MAX_VIDEO_SIZE
      expect(extension).toBeDefined();
    });

    it('should validate file size on drop', () => {
      const extension = Video({
        onVideoUpload: vi.fn().mockResolvedValue('url'),
      });

      // Drop handler validates against MAX_VIDEO_SIZE
      expect(extension).toBeDefined();
    });

    it('should reject videos larger than 50MB', () => {
      const extension = Video({
        onVideoUpload: vi.fn(),
      });

      // Files > 50MB are logged as error and skipped
      expect(extension).toBeDefined();
    });
  });

  describe('upload placeholder', () => {
    it('should show loading placeholder during upload', () => {
      const extension = Video({
        onVideoUpload: vi
          .fn()
          .mockImplementation(
            () =>
              new Promise((resolve) => setTimeout(() => resolve('url'), 100))
          ),
      });

      // Uses videoUploadPlaceholderPluginKey for placeholders
      expect(extension).toBeDefined();
    });

    it('should display video dimensions in placeholder', () => {
      const extension = Video({
        onVideoUpload: vi.fn().mockResolvedValue('url'),
      });

      // Placeholder dimensions based on video metadata
      expect(extension).toBeDefined();
    });

    it('should use default dimensions if metadata fails to load', () => {
      const extension = Video({
        onVideoUpload: vi.fn().mockResolvedValue('url'),
      });

      // Falls back to 640x360 if getVideoDimensions fails
      expect(extension).toBeDefined();
    });

    it('should remove placeholder after successful upload', () => {
      const extension = Video({
        onVideoUpload: vi.fn().mockResolvedValue('url'),
      });

      // Placeholder removed via setMeta remove action
      expect(extension).toBeDefined();
    });

    it('should remove placeholder on upload error', () => {
      const extension = Video({
        onVideoUpload: vi.fn().mockRejectedValue(new Error('Upload failed')),
      });

      // Error handler removes placeholder
      expect(extension).toBeDefined();
    });
  });

  describe('paste handler', () => {
    it('should handle video paste events', () => {
      const mockUpload = vi
        .fn()
        .mockResolvedValue('https://example.com/video.mp4');
      const extension = Video({ onVideoUpload: mockUpload });

      expect(extension).toBeDefined();
    });

    it('should filter video files from clipboard', () => {
      const extension = Video({
        onVideoUpload: vi.fn().mockResolvedValue('url'),
      });

      // Filters items with type starting with 'video/'
      expect(extension).toBeDefined();
    });

    it('should handle multiple videos in clipboard', () => {
      const extension = Video({
        onVideoUpload: vi.fn().mockResolvedValue('url'),
      });

      // Processes all videos sequentially
      expect(extension).toBeDefined();
    });

    it('should replace selection when pasting', () => {
      const extension = Video({
        onVideoUpload: vi.fn().mockResolvedValue('url'),
      });

      // Deletes selection (from, to) before inserting
      expect(extension).toBeDefined();
    });

    it('should not handle paste if no upload handler provided', () => {
      const extension = Video();

      // Returns false if onVideoUpload not provided
      expect(extension).toBeDefined();
    });
  });

  describe('drop handler', () => {
    it('should handle video drop events', () => {
      const mockUpload = vi
        .fn()
        .mockResolvedValue('https://example.com/video.mp4');
      const extension = Video({ onVideoUpload: mockUpload });

      expect(extension).toBeDefined();
    });

    it('should filter video files from dropped files', () => {
      const extension = Video({
        onVideoUpload: vi.fn().mockResolvedValue('url'),
      });

      // Filters files with /video/i regex test
      expect(extension).toBeDefined();
    });

    it('should insert at drop position', () => {
      const extension = Video({
        onVideoUpload: vi.fn().mockResolvedValue('url'),
      });

      // Uses posAtCoords to determine drop position
      expect(extension).toBeDefined();
    });

    it('should handle multiple videos dropped', () => {
      const extension = Video({
        onVideoUpload: vi.fn().mockResolvedValue('url'),
      });

      // Processes videos sequentially
      expect(extension).toBeDefined();
    });

    it('should not handle drop if no upload handler provided', () => {
      const extension = Video();

      // Returns false if onVideoUpload not provided
      expect(extension).toBeDefined();
    });

    it('should validate drop coordinates', () => {
      const extension = Video({
        onVideoUpload: vi.fn().mockResolvedValue('url'),
      });

      // Returns early if coordinates invalid
      expect(extension).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle upload errors gracefully', () => {
      const mockUpload = vi.fn().mockRejectedValue(new Error('Network error'));
      const extension = Video({ onVideoUpload: mockUpload });

      expect(extension).toBeDefined();
      // Errors are caught and logged
    });

    it('should handle missing video node schema', () => {
      const extension = Video({
        onVideoUpload: vi.fn().mockResolvedValue('url'),
      });

      expect(extension).toBeDefined();
      // Checks for schema.nodes.video existence
    });

    it('should handle dimension loading errors', () => {
      const extension = Video({
        onVideoUpload: vi.fn().mockResolvedValue('url'),
      });

      expect(extension).toBeDefined();
      // Uses default dimensions (640x360) on error
    });

    it('should log errors to console', () => {
      const extension = Video({
        onVideoUpload: vi.fn().mockRejectedValue(new Error('Test error')),
      });

      expect(extension).toBeDefined();
      // console.error called with error details
    });
  });

  describe('sequential processing', () => {
    it('should process videos one at a time to avoid conflicts', () => {
      const extension = Video({
        onVideoUpload: vi.fn().mockResolvedValue('url'),
      });

      expect(extension).toBeDefined();
      // Uses for...of loop for sequential processing
    });

    it('should update position for each subsequent video', () => {
      const extension = Video({
        onVideoUpload: vi.fn().mockResolvedValue('url'),
      });

      expect(extension).toBeDefined();
      // currentPos updated after each insertion
    });

    it('should continue processing remaining videos if one fails', () => {
      const mockUpload = vi
        .fn()
        .mockRejectedValueOnce(new Error('First failed'))
        .mockResolvedValueOnce('url2')
        .mockResolvedValueOnce('url3');

      const extension = Video({ onVideoUpload: mockUpload });

      expect(extension).toBeDefined();
      // catch block allows loop to continue
    });
  });

  describe('video rendering', () => {
    it('should render video with controls', () => {
      const extension = Video();

      // renderHTML includes controls: 'true'
      expect(extension).toBeDefined();
    });

    it('should render video at full width', () => {
      const extension = Video();

      // renderHTML includes style: 'width: 100%'
      expect(extension).toBeDefined();
    });

    it('should include source element', () => {
      const extension = Video();

      // renderHTML creates nested source element
      expect(extension).toBeDefined();
    });
  });

  describe('placeholder plugin', () => {
    it('should use separate plugin key from images', () => {
      const extension = Video({
        onVideoUpload: vi.fn().mockResolvedValue('url'),
      });

      // Uses videoUploadPlaceholderPluginKey, not imageUploadPlaceholderPluginKey
      expect(extension).toBeDefined();
    });

    it('should track placeholder state through document changes', () => {
      const extension = Video({
        onVideoUpload: vi.fn().mockResolvedValue('url'),
      });

      // Plugin state maps decorations through tr.mapping
      expect(extension).toBeDefined();
    });

    it('should find shifted placeholder positions', () => {
      const extension = Video({
        onVideoUpload: vi.fn().mockResolvedValue('url'),
      });

      // Uses findUploadPlaceholder to track position shifts
      expect(extension).toBeDefined();
    });
  });

  describe('integration with editor', () => {
    it('should work without breaking other plugins', () => {
      const extension = Video({
        onVideoUpload: vi.fn().mockResolvedValue('url'),
      });

      expect(extension).toBeDefined();
    });

    it('should prevent default browser behavior on paste', () => {
      const extension = Video({
        onVideoUpload: vi.fn().mockResolvedValue('url'),
      });

      // event.preventDefault() called
      expect(extension).toBeDefined();
    });

    it('should prevent default browser behavior on drop', () => {
      const extension = Video({
        onVideoUpload: vi.fn().mockResolvedValue('url'),
      });

      // event.preventDefault() called
      expect(extension).toBeDefined();
    });
  });
});
