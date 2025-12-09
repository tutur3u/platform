import { describe, expect, it } from 'vitest';
import {
  computeNodeDiff,
  flattenMediaNodes,
  getNodeDisplayLabel,
  getNodeIdentifier,
  getNodeImageSrc,
  hasNodeDifferences,
  parseJsonContent,
} from '../node-diff';

describe('Node Diff', () => {
  describe('getNodeIdentifier', () => {
    it('returns src-based identifier for images', () => {
      const node = {
        type: 'image',
        attrs: { src: 'https://example.com/cat.png' },
      };
      expect(getNodeIdentifier(node)).toBe('image:https://example.com/cat.png');
    });

    it('returns src-based identifier for imageResize', () => {
      const node = {
        type: 'imageResize',
        attrs: { src: 'https://example.com/cat.png', width: 400 },
      };
      expect(getNodeIdentifier(node)).toBe(
        'imageResize:https://example.com/cat.png'
      );
    });

    it('returns src-based identifier for video', () => {
      const node = {
        type: 'video',
        attrs: { src: 'https://example.com/video.mp4' },
      };
      expect(getNodeIdentifier(node)).toBe(
        'video:https://example.com/video.mp4'
      );
    });

    it('returns src or videoId for youtube', () => {
      const node1 = {
        type: 'youtube',
        attrs: { src: 'https://youtube.com/watch?v=abc123' },
      };
      expect(getNodeIdentifier(node1)).toBe(
        'youtube:https://youtube.com/watch?v=abc123'
      );

      const node2 = { type: 'youtube', attrs: { videoId: 'xyz789' } };
      expect(getNodeIdentifier(node2)).toBe('youtube:xyz789');
    });

    it('returns id-based identifier for mentions', () => {
      const node = {
        type: 'mention',
        attrs: { id: 'user-123', label: 'John' },
      };
      expect(getNodeIdentifier(node)).toBe('mention:user-123');
    });

    it('handles missing attributes', () => {
      const node = { type: 'image' };
      expect(getNodeIdentifier(node)).toBe('image:unknown');
    });

    it('returns type only for non-identifiable nodes', () => {
      const node = { type: 'paragraph' };
      expect(getNodeIdentifier(node)).toBe('paragraph');
    });
  });

  describe('getNodeDisplayLabel', () => {
    it('shows filename for images with src', () => {
      const node = {
        type: 'image',
        attrs: { src: 'https://example.com/uploads/cat-photo.png' },
      };
      expect(getNodeDisplayLabel(node)).toBe('cat-photo.png');
    });

    it('shows alt text with filename for images', () => {
      const node = {
        type: 'image',
        attrs: { src: 'https://example.com/cat.png', alt: 'My Cat' },
      };
      expect(getNodeDisplayLabel(node)).toBe('My Cat (cat.png)');
    });

    it('truncates long filenames', () => {
      const node = {
        type: 'image',
        attrs: {
          src: 'https://example.com/very-long-filename-that-should-be-truncated-for-display.png',
        },
      };
      const label = getNodeDisplayLabel(node);
      expect(label.length).toBeLessThanOrEqual(43); // 40 + '...'
    });

    it('shows video filename', () => {
      const node = {
        type: 'video',
        attrs: { src: 'https://example.com/intro.mp4' },
      };
      expect(getNodeDisplayLabel(node)).toBe('intro.mp4');
    });

    it('shows YouTube title if available', () => {
      const node = {
        type: 'youtube',
        attrs: { src: 'https://youtube.com/watch?v=abc', title: 'My Video' },
      };
      expect(getNodeDisplayLabel(node)).toBe('My Video');
    });

    it('extracts YouTube video ID from URL', () => {
      const node = {
        type: 'youtube',
        attrs: { src: 'https://youtube.com/watch?v=abc123' },
      };
      expect(getNodeDisplayLabel(node)).toBe('YouTube: abc123');
    });

    it('shows mention label with @', () => {
      const node = {
        type: 'mention',
        attrs: { label: 'John Doe', id: 'user-123' },
      };
      expect(getNodeDisplayLabel(node)).toBe('@John Doe');
    });

    it('falls back to id for mentions without label', () => {
      const node = { type: 'mention', attrs: { id: 'user-123' } };
      expect(getNodeDisplayLabel(node)).toBe('@user-123');
    });

    it('returns node type for unknown nodes', () => {
      const node = { type: 'customNode' };
      expect(getNodeDisplayLabel(node)).toBe('customNode');
    });
  });

  describe('flattenMediaNodes', () => {
    it('extracts images from content', () => {
      const content = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'image', attrs: { src: 'img1.png' } },
              { type: 'text', text: 'Hello' },
            ],
          },
          { type: 'image', attrs: { src: 'img2.png' } },
        ],
      };
      const nodes = flattenMediaNodes(content);
      expect(nodes).toHaveLength(2);
      expect(nodes[0]?.node.attrs?.src).toBe('img1.png');
      expect(nodes[0]?.path).toEqual([0, 0]);
      expect(nodes[1]?.node.attrs?.src).toBe('img2.png');
      expect(nodes[1]?.path).toEqual([1]);
    });

    it('extracts mentions', () => {
      const content = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Hello ' },
              { type: 'mention', attrs: { id: 'user-1', label: 'John' } },
            ],
          },
        ],
      };
      const nodes = flattenMediaNodes(content);
      expect(nodes).toHaveLength(1);
      expect(nodes[0]?.node.type).toBe('mention');
      expect(nodes[0]?.path).toEqual([0, 1]);
    });

    it('extracts video and youtube nodes', () => {
      const content = {
        type: 'doc',
        content: [
          { type: 'video', attrs: { src: 'video.mp4' } },
          { type: 'youtube', attrs: { src: 'https://youtube.com/...' } },
        ],
      };
      const nodes = flattenMediaNodes(content);
      expect(nodes).toHaveLength(2);
      expect(nodes[0]?.node.type).toBe('video');
      expect(nodes[1]?.node.type).toBe('youtube');
    });

    it('ignores non-identifiable nodes', () => {
      const content = {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] },
        ],
      };
      const nodes = flattenMediaNodes(content);
      expect(nodes).toHaveLength(0);
    });

    it('handles null/undefined content', () => {
      expect(flattenMediaNodes(null)).toEqual([]);
      expect(flattenMediaNodes(undefined)).toEqual([]);
    });

    it('extracts deeply nested media', () => {
      const content = {
        type: 'doc',
        content: [
          {
            type: 'blockquote',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'image',
                    attrs: { src: 'nested-image.png' },
                  },
                ],
              },
            ],
          },
        ],
      };
      const nodes = flattenMediaNodes(content);
      expect(nodes).toHaveLength(1);
      expect(nodes[0]?.path).toEqual([0, 0, 0]);
    });
  });

  describe('computeNodeDiff', () => {
    it('detects added images', () => {
      const oldContent = {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] },
        ],
      };
      const newContent = {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] },
          { type: 'image', attrs: { src: 'new-image.png' } },
        ],
      };

      const diff = computeNodeDiff(oldContent, newContent);
      expect(diff.added).toHaveLength(1);
      expect(diff.added[0]?.nodeType).toBe('image');
      expect(diff.added[0]?.newNode?.attrs?.src).toBe('new-image.png');
      expect(diff.hasMediaChanges).toBe(true);
    });

    it('detects removed images', () => {
      const oldContent = {
        type: 'doc',
        content: [
          { type: 'image', attrs: { src: 'old-image.png' } },
          { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] },
        ],
      };
      const newContent = {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] },
        ],
      };

      const diff = computeNodeDiff(oldContent, newContent);
      expect(diff.removed).toHaveLength(1);
      expect(diff.removed[0]?.nodeType).toBe('image');
      expect(diff.removed[0]?.oldNode?.attrs?.src).toBe('old-image.png');
      expect(diff.hasMediaChanges).toBe(true);
    });

    it('detects different images with same alt text', () => {
      const oldContent = {
        type: 'doc',
        content: [{ type: 'image', attrs: { src: 'cat.png', alt: 'Pet' } }],
      };
      const newContent = {
        type: 'doc',
        content: [{ type: 'image', attrs: { src: 'dog.png', alt: 'Pet' } }],
      };

      const diff = computeNodeDiff(oldContent, newContent);
      // Different src = different images, so one added, one removed
      expect(diff.added).toHaveLength(1);
      expect(diff.removed).toHaveLength(1);
      expect(diff.added[0]?.newNode?.attrs?.src).toBe('dog.png');
      expect(diff.removed[0]?.oldNode?.attrs?.src).toBe('cat.png');
    });

    it('detects modified image attributes', () => {
      const oldContent = {
        type: 'doc',
        content: [
          {
            type: 'image',
            attrs: { src: 'image.png', width: 400, alt: 'Old Alt' },
          },
        ],
      };
      const newContent = {
        type: 'doc',
        content: [
          {
            type: 'image',
            attrs: { src: 'image.png', width: 800, alt: 'New Alt' },
          },
        ],
      };

      const diff = computeNodeDiff(oldContent, newContent);
      expect(diff.modified).toHaveLength(1);
      expect(diff.modified[0]?.attributeChanges).toBeDefined();
      expect(diff.modified[0]?.attributeChanges).toContainEqual({
        key: 'width',
        oldValue: 400,
        newValue: 800,
      });
      expect(diff.modified[0]?.attributeChanges).toContainEqual({
        key: 'alt',
        oldValue: 'Old Alt',
        newValue: 'New Alt',
      });
    });

    it('detects mention changes with different IDs but same label', () => {
      const oldContent = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'mention', attrs: { id: 'user-1', label: 'John' } },
            ],
          },
        ],
      };
      const newContent = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'mention', attrs: { id: 'user-2', label: 'John' } },
            ],
          },
        ],
      };

      const diff = computeNodeDiff(oldContent, newContent);
      // Different IDs = different mentions
      expect(diff.added).toHaveLength(1);
      expect(diff.removed).toHaveLength(1);
    });

    it('handles null old content (all added)', () => {
      const newContent = {
        type: 'doc',
        content: [{ type: 'image', attrs: { src: 'image.png' } }],
      };

      const diff = computeNodeDiff(null, newContent);
      expect(diff.added).toHaveLength(1);
      expect(diff.removed).toHaveLength(0);
    });

    it('handles null new content (all removed)', () => {
      const oldContent = {
        type: 'doc',
        content: [{ type: 'image', attrs: { src: 'image.png' } }],
      };

      const diff = computeNodeDiff(oldContent, null);
      expect(diff.added).toHaveLength(0);
      expect(diff.removed).toHaveLength(1);
    });

    it('handles both null (no changes)', () => {
      const diff = computeNodeDiff(null, null);
      expect(diff.totalChanges).toBe(0);
      expect(diff.hasMediaChanges).toBe(false);
    });

    it('handles identical content (no changes)', () => {
      const content = {
        type: 'doc',
        content: [{ type: 'image', attrs: { src: 'image.png' } }],
      };

      const diff = computeNodeDiff(content, content);
      expect(diff.totalChanges).toBe(0);
    });

    it('handles multiple duplicate images', () => {
      const oldContent = {
        type: 'doc',
        content: [
          { type: 'image', attrs: { src: 'image.png' } },
          { type: 'image', attrs: { src: 'image.png' } },
        ],
      };
      const newContent = {
        type: 'doc',
        content: [{ type: 'image', attrs: { src: 'image.png' } }],
      };

      const diff = computeNodeDiff(oldContent, newContent);
      // One duplicate removed
      expect(diff.removed).toHaveLength(1);
    });

    it('correctly calculates totalChanges', () => {
      const oldContent = {
        type: 'doc',
        content: [
          { type: 'image', attrs: { src: 'old.png' } },
          { type: 'image', attrs: { src: 'same.png', width: 100 } },
        ],
      };
      const newContent = {
        type: 'doc',
        content: [
          { type: 'image', attrs: { src: 'new.png' } },
          { type: 'image', attrs: { src: 'same.png', width: 200 } },
        ],
      };

      const diff = computeNodeDiff(oldContent, newContent);
      // 1 added (new.png), 1 removed (old.png), 1 modified (same.png width change)
      expect(diff.totalChanges).toBe(3);
    });

    it('handles video changes', () => {
      const oldContent = {
        type: 'doc',
        content: [{ type: 'video', attrs: { src: 'old-video.mp4' } }],
      };
      const newContent = {
        type: 'doc',
        content: [{ type: 'video', attrs: { src: 'new-video.mp4' } }],
      };

      const diff = computeNodeDiff(oldContent, newContent);
      expect(diff.added).toHaveLength(1);
      expect(diff.removed).toHaveLength(1);
      expect(diff.hasMediaChanges).toBe(true);
    });

    it('handles youtube changes', () => {
      const oldContent = {
        type: 'doc',
        content: [
          {
            type: 'youtube',
            attrs: { src: 'https://youtube.com/watch?v=old' },
          },
        ],
      };
      const newContent = {
        type: 'doc',
        content: [
          {
            type: 'youtube',
            attrs: { src: 'https://youtube.com/watch?v=new' },
          },
        ],
      };

      const diff = computeNodeDiff(oldContent, newContent);
      expect(diff.added).toHaveLength(1);
      expect(diff.removed).toHaveLength(1);
      expect(diff.hasMediaChanges).toBe(true);
    });
  });

  describe('parseJsonContent', () => {
    it('parses JSON string', () => {
      const json = JSON.stringify({ type: 'doc', content: [] });
      const result = parseJsonContent(json);
      expect(result).toEqual({ type: 'doc', content: [] });
    });

    it('returns object as-is', () => {
      const obj = { type: 'doc', content: [] };
      const result = parseJsonContent(obj);
      expect(result).toBe(obj);
    });

    it('returns null for null/undefined', () => {
      expect(parseJsonContent(null)).toBeNull();
      expect(parseJsonContent(undefined)).toBeNull();
    });

    it('returns null for invalid JSON', () => {
      expect(parseJsonContent('not valid json')).toBeNull();
    });
  });

  describe('getNodeImageSrc', () => {
    it('returns src for image nodes', () => {
      const node = {
        type: 'image',
        attrs: { src: 'https://example.com/cat.png' },
      };
      expect(getNodeImageSrc(node)).toBe('https://example.com/cat.png');
    });

    it('returns src for imageResize nodes', () => {
      const node = {
        type: 'imageResize',
        attrs: { src: 'https://example.com/cat.png', width: 400 },
      };
      expect(getNodeImageSrc(node)).toBe('https://example.com/cat.png');
    });

    it('returns null for non-image nodes', () => {
      const node = { type: 'video', attrs: { src: 'video.mp4' } };
      expect(getNodeImageSrc(node)).toBeNull();
    });

    it('returns null for missing src', () => {
      const node = { type: 'image' };
      expect(getNodeImageSrc(node)).toBeNull();
    });
  });

  describe('hasNodeDifferences', () => {
    it('returns true when there are differences', () => {
      const old = {
        type: 'doc',
        content: [{ type: 'image', attrs: { src: 'a.png' } }],
      };
      const newC = {
        type: 'doc',
        content: [{ type: 'image', attrs: { src: 'b.png' } }],
      };
      expect(hasNodeDifferences(old, newC)).toBe(true);
    });

    it('returns false when content is identical', () => {
      const content = {
        type: 'doc',
        content: [{ type: 'image', attrs: { src: 'a.png' } }],
      };
      expect(hasNodeDifferences(content, content)).toBe(false);
    });

    it('returns false when both are null', () => {
      expect(hasNodeDifferences(null, null)).toBe(false);
    });

    it('returns true when one is null', () => {
      const content = {
        type: 'doc',
        content: [{ type: 'image', attrs: { src: 'a.png' } }],
      };
      expect(hasNodeDifferences(content, null)).toBe(true);
      expect(hasNodeDifferences(null, content)).toBe(true);
    });
  });
});
