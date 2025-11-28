import { describe, expect, it } from 'vitest';
import {
  getDescriptionMetadata,
  getDescriptionText,
  removeAccents,
} from '../text-helper';

describe('Text Helper', () => {
  describe('removeAccents', () => {
    it('removes diacritics from accented characters', () => {
      expect(removeAccents('café')).toBe('cafe');
      expect(removeAccents('naïve')).toBe('naive');
      expect(removeAccents('résumé')).toBe('resume');
    });

    it('handles Vietnamese characters', () => {
      expect(removeAccents('đường')).toBe('duong');
      expect(removeAccents('Đà Nẵng')).toBe('Da Nang');
    });

    it('replaces Vietnamese đ and Đ', () => {
      expect(removeAccents('đ')).toBe('d');
      expect(removeAccents('Đ')).toBe('D');
    });

    it('preserves unaccented characters', () => {
      expect(removeAccents('hello')).toBe('hello');
      expect(removeAccents('world')).toBe('world');
    });

    it('handles empty string', () => {
      expect(removeAccents('')).toBe('');
    });

    it('handles mixed content', () => {
      expect(removeAccents('Hello Việt Nam')).toBe('Hello Viet Nam');
    });

    it('handles numbers and symbols', () => {
      expect(removeAccents('test123!@#')).toBe('test123!@#');
    });
  });

  describe('getDescriptionText', () => {
    it('returns empty string for empty input', () => {
      expect(getDescriptionText('')).toBe('');
      expect(getDescriptionText(undefined)).toBe('');
      expect(getDescriptionText(null as any)).toBe('');
    });

    it('extracts text from simple paragraph', () => {
      const json = JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Hello World' }],
          },
        ],
      });
      expect(getDescriptionText(json)).toBe('Hello World');
    });

    it('handles multiple paragraphs', () => {
      const json = JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'First paragraph' }],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Second paragraph' }],
          },
        ],
      });
      const result = getDescriptionText(json);
      expect(result).toContain('First paragraph');
      expect(result).toContain('Second paragraph');
    });

    it('handles headings', () => {
      const json = JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: 'Main Title' }],
          },
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'Subtitle' }],
          },
        ],
      });
      const result = getDescriptionText(json);
      expect(result).toContain('# Main Title');
      expect(result).toContain('## Subtitle');
    });

    it('handles bullet lists', () => {
      const json = JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Item 1' }],
                  },
                ],
              },
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Item 2' }],
                  },
                ],
              },
            ],
          },
        ],
      });
      const result = getDescriptionText(json);
      expect(result).toContain('Item 1');
      expect(result).toContain('Item 2');
    });

    it('handles ordered lists', () => {
      const json = JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'orderedList',
            attrs: { start: 1 },
            content: [
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'First' }],
                  },
                ],
              },
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Second' }],
                  },
                ],
              },
            ],
          },
        ],
      });
      const result = getDescriptionText(json);
      expect(result).toContain('1.');
      expect(result).toContain('2.');
    });

    it('handles task lists', () => {
      const json = JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'taskList',
            content: [
              {
                type: 'taskItem',
                attrs: { checked: false },
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Todo item' }],
                  },
                ],
              },
              {
                type: 'taskItem',
                attrs: { checked: true },
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Done item' }],
                  },
                ],
              },
            ],
          },
        ],
      });
      const result = getDescriptionText(json);
      expect(result).toContain('[ ] Todo item');
      expect(result).toContain('[x] Done item');
    });

    it('handles blockquotes', () => {
      const json = JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'blockquote',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Quoted text' }],
              },
            ],
          },
        ],
      });
      const result = getDescriptionText(json);
      expect(result).toContain('> Quoted text');
    });

    it('handles code blocks', () => {
      const json = JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'codeBlock',
            attrs: { language: 'javascript' },
            content: [{ type: 'text', text: 'const x = 1;' }],
          },
        ],
      });
      const result = getDescriptionText(json);
      expect(result).toContain('```javascript');
      expect(result).toContain('const x = 1;');
      expect(result).toContain('```');
    });

    it('handles hard breaks', () => {
      const json = JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Line 1' },
              { type: 'hardBreak' },
              { type: 'text', text: 'Line 2' },
            ],
          },
        ],
      });
      const result = getDescriptionText(json);
      expect(result).toContain('Line 1\nLine 2');
    });

    it('handles horizontal rules', () => {
      const json = JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Above' }],
          },
          { type: 'horizontalRule' },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Below' }],
          },
        ],
      });
      const result = getDescriptionText(json);
      expect(result).toContain('---');
    });

    it('handles images', () => {
      const json = JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'image',
            attrs: { alt: 'My Image' },
          },
        ],
      });
      const result = getDescriptionText(json);
      expect(result).toContain('[My Image]');
    });

    it('handles mentions', () => {
      const json = JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Hello ' },
              { type: 'mention', attrs: { label: 'John' } },
            ],
          },
        ],
      });
      const result = getDescriptionText(json);
      expect(result).toContain('@John');
    });

    it('handles tables', () => {
      const json = JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'table',
            content: [
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableCell',
                    content: [
                      {
                        type: 'paragraph',
                        content: [{ type: 'text', text: 'Cell 1' }],
                      },
                    ],
                  },
                  {
                    type: 'tableCell',
                    content: [
                      {
                        type: 'paragraph',
                        content: [{ type: 'text', text: 'Cell 2' }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });
      const result = getDescriptionText(json);
      expect(result).toContain('Cell 1');
      expect(result).toContain('Cell 2');
      expect(result).toContain('|');
    });

    it('handles YouTube embeds', () => {
      const json = JSON.stringify({
        type: 'doc',
        content: [
          { type: 'youtube', attrs: { src: 'https://youtube.com/...' } },
        ],
      });
      const result = getDescriptionText(json);
      expect(result).toContain('[YouTube Video]');
    });

    it('returns plain text for invalid JSON', () => {
      expect(getDescriptionText('plain text')).toBe('plain text');
      expect(getDescriptionText('not valid json {')).toBe('not valid json {');
    });

    it('handles Json object directly', () => {
      const jsonObj = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Direct object' }],
          },
        ],
      };
      expect(getDescriptionText(jsonObj)).toBe('Direct object');
    });

    it('cleans up excessive newlines', () => {
      const json = JSON.stringify({
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'A' }] },
          { type: 'paragraph', content: [] },
          { type: 'paragraph', content: [] },
          { type: 'paragraph', content: [] },
          { type: 'paragraph', content: [{ type: 'text', text: 'B' }] },
        ],
      });
      const result = getDescriptionText(json);
      // Should not have more than 2 consecutive newlines
      expect(result).not.toMatch(/\n{3,}/);
    });
  });

  describe('getDescriptionMetadata', () => {
    it('returns default metadata for empty input', () => {
      const result = getDescriptionMetadata('');
      expect(result.hasText).toBe(false);
      expect(result.hasImages).toBe(false);
      expect(result.hasVideos).toBe(false);
      expect(result.hasLinks).toBe(false);
      expect(result.imageCount).toBe(0);
      expect(result.videoCount).toBe(0);
      expect(result.linkCount).toBe(0);
      expect(result.totalCheckboxes).toBe(0);
      expect(result.checkedCheckboxes).toBe(0);
    });

    it('detects text content', () => {
      const json = JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Hello' }],
          },
        ],
      });
      const result = getDescriptionMetadata(json);
      expect(result.hasText).toBe(true);
    });

    it('ignores empty text', () => {
      const json = JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: '   ' }],
          },
        ],
      });
      const result = getDescriptionMetadata(json);
      expect(result.hasText).toBe(false);
    });

    it('detects images', () => {
      const json = JSON.stringify({
        type: 'doc',
        content: [
          { type: 'image', attrs: { src: 'img1.png' } },
          { type: 'image', attrs: { src: 'img2.png' } },
        ],
      });
      const result = getDescriptionMetadata(json);
      expect(result.hasImages).toBe(true);
      expect(result.imageCount).toBe(2);
    });

    it('detects imageResize nodes', () => {
      const json = JSON.stringify({
        type: 'doc',
        content: [{ type: 'imageResize', attrs: { src: 'img.png' } }],
      });
      const result = getDescriptionMetadata(json);
      expect(result.hasImages).toBe(true);
      expect(result.imageCount).toBe(1);
    });

    it('detects videos', () => {
      const json = JSON.stringify({
        type: 'doc',
        content: [{ type: 'video', attrs: { src: 'video.mp4' } }],
      });
      const result = getDescriptionMetadata(json);
      expect(result.hasVideos).toBe(true);
      expect(result.videoCount).toBe(1);
    });

    it('detects YouTube embeds as videos', () => {
      const json = JSON.stringify({
        type: 'doc',
        content: [
          { type: 'youtube', attrs: { src: 'https://youtube.com/...' } },
          { type: 'video', attrs: { src: 'video.mp4' } },
        ],
      });
      const result = getDescriptionMetadata(json);
      expect(result.hasVideos).toBe(true);
      expect(result.videoCount).toBe(2);
    });

    it('detects links in marks', () => {
      const json = JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Click here',
                marks: [
                  { type: 'link', attrs: { href: 'https://example.com' } },
                ],
              },
            ],
          },
        ],
      });
      const result = getDescriptionMetadata(json);
      expect(result.hasLinks).toBe(true);
      expect(result.linkCount).toBe(1);
    });

    it('counts checkboxes', () => {
      const json = JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'taskList',
            content: [
              {
                type: 'taskItem',
                attrs: { checked: false },
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Todo' }],
                  },
                ],
              },
              {
                type: 'taskItem',
                attrs: { checked: true },
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Done' }],
                  },
                ],
              },
              {
                type: 'taskItem',
                attrs: { checked: true },
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Also done' }],
                  },
                ],
              },
            ],
          },
        ],
      });
      const result = getDescriptionMetadata(json);
      expect(result.totalCheckboxes).toBe(3);
      expect(result.checkedCheckboxes).toBe(2);
    });

    it('handles invalid JSON as plain text', () => {
      const result = getDescriptionMetadata('some plain text');
      expect(result.hasText).toBe(true);
    });

    it('handles empty plain text', () => {
      const result = getDescriptionMetadata('   ');
      expect(result.hasText).toBe(false);
    });

    it('handles Json object directly', () => {
      const jsonObj = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Direct object' }],
          },
        ],
      };
      const result = getDescriptionMetadata(jsonObj);
      expect(result.hasText).toBe(true);
    });

    it('recursively analyzes nested content', () => {
      const json = JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'blockquote',
            content: [
              {
                type: 'paragraph',
                content: [
                  { type: 'text', text: 'Nested text' },
                  { type: 'image', attrs: { src: 'img.png' } },
                ],
              },
            ],
          },
        ],
      });
      const result = getDescriptionMetadata(json);
      expect(result.hasText).toBe(true);
      expect(result.hasImages).toBe(true);
    });
  });
});
