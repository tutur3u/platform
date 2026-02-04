import type { JSONContent } from '@tiptap/react';
import { describe, expect, it } from 'vitest';
import {
  migrateInlineImagesToBlock,
  needsMigration,
} from '../content-migration';

describe('content-migration', () => {
  describe('migrateInlineImagesToBlock', () => {
    it('should return null for null content', () => {
      expect(migrateInlineImagesToBlock(null)).toBe(null);
    });

    it('should return content unchanged if no content array', () => {
      const content: JSONContent = { type: 'doc' };
      expect(migrateInlineImagesToBlock(content)).toEqual(content);
    });

    it('should pass through content with no images', () => {
      const content: JSONContent = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Hello world' }],
          },
        ],
      };
      const result = migrateInlineImagesToBlock(content);
      expect(result).toEqual(content);
    });

    it('should pass through block-level images unchanged', () => {
      const content: JSONContent = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Some text' }],
          },
          {
            type: 'imageResize',
            attrs: { src: 'https://example.com/image.png', width: 480 },
          },
        ],
      };
      const result = migrateInlineImagesToBlock(content);
      expect(result).toEqual(content);
    });

    it('should extract inline image from paragraph to block level', () => {
      const content: JSONContent = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Here is an image: ' },
              {
                type: 'imageResize',
                attrs: { src: 'https://example.com/image.png', width: 480 },
              },
            ],
          },
        ],
      };

      const result = migrateInlineImagesToBlock(content);

      expect(result?.content).toHaveLength(2);
      expect(result?.content?.[0]).toEqual({
        type: 'paragraph',
        content: [{ type: 'text', text: 'Here is an image: ' }],
      });
      expect(result?.content?.[1]).toEqual({
        type: 'imageResize',
        attrs: { src: 'https://example.com/image.png', width: 480 },
      });
    });

    it('should extract multiple inline images from same paragraph', () => {
      const content: JSONContent = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Two images: ' },
              {
                type: 'imageResize',
                attrs: { src: 'https://example.com/image1.png', width: 400 },
              },
              { type: 'text', text: ' and ' },
              {
                type: 'imageResize',
                attrs: { src: 'https://example.com/image2.png', width: 400 },
              },
            ],
          },
        ],
      };

      const result = migrateInlineImagesToBlock(content);

      expect(result?.content).toHaveLength(3);
      expect(result?.content?.[0]?.type).toBe('paragraph');
      expect(result?.content?.[0]?.content).toEqual([
        { type: 'text', text: 'Two images: ' },
        { type: 'text', text: ' and ' },
      ]);
      expect(result?.content?.[1]?.type).toBe('imageResize');
      expect(result?.content?.[2]?.type).toBe('imageResize');
    });

    it('should remove empty paragraph when only image content', () => {
      const content: JSONContent = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'imageResize',
                attrs: { src: 'https://example.com/image.png', width: 480 },
              },
            ],
          },
        ],
      };

      const result = migrateInlineImagesToBlock(content);

      // Empty paragraph should be removed, only image remains
      expect(result?.content).toHaveLength(1);
      expect(result?.content?.[0]?.type).toBe('imageResize');
    });

    it('should handle legacy image node type', () => {
      const content: JSONContent = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Legacy: ' },
              {
                type: 'image',
                attrs: { src: 'https://example.com/legacy.png' },
              },
            ],
          },
        ],
      };

      const result = migrateInlineImagesToBlock(content);

      expect(result?.content).toHaveLength(2);
      expect(result?.content?.[0]?.type).toBe('paragraph');
      expect(result?.content?.[1]?.type).toBe('image');
    });

    it('should handle mixed imageResize and image nodes', () => {
      const content: JSONContent = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Mixed: ' },
              {
                type: 'image',
                attrs: { src: 'https://example.com/old.png' },
              },
              {
                type: 'imageResize',
                attrs: { src: 'https://example.com/new.png', width: 480 },
              },
            ],
          },
        ],
      };

      const result = migrateInlineImagesToBlock(content);

      expect(result?.content).toHaveLength(3);
      expect(result?.content?.[0]?.type).toBe('paragraph');
      expect(result?.content?.[1]?.type).toBe('image');
      expect(result?.content?.[2]?.type).toBe('imageResize');
    });

    it('should preserve paragraph with whitespace-only text after extraction', () => {
      const content: JSONContent = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: '   ' },
              {
                type: 'imageResize',
                attrs: { src: 'https://example.com/image.png', width: 480 },
              },
            ],
          },
        ],
      };

      const result = migrateInlineImagesToBlock(content);

      // Whitespace-only paragraph should be removed
      expect(result?.content).toHaveLength(1);
      expect(result?.content?.[0]?.type).toBe('imageResize');
    });

    it('should handle multiple paragraphs with images', () => {
      const content: JSONContent = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'First: ' },
              {
                type: 'imageResize',
                attrs: { src: 'https://example.com/img1.png', width: 400 },
              },
            ],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'No image here' }],
          },
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Second: ' },
              {
                type: 'imageResize',
                attrs: { src: 'https://example.com/img2.png', width: 400 },
              },
            ],
          },
        ],
      };

      const result = migrateInlineImagesToBlock(content);

      expect(result?.content).toHaveLength(5);
      expect(result?.content?.[0]?.content?.[0]?.text).toBe('First: ');
      expect(result?.content?.[1]?.type).toBe('imageResize');
      expect(result?.content?.[2]?.content?.[0]?.text).toBe('No image here');
      expect(result?.content?.[3]?.content?.[0]?.text).toBe('Second: ');
      expect(result?.content?.[4]?.type).toBe('imageResize');
    });

    describe('nested structures', () => {
      it('should handle images in blockquotes', () => {
        const content: JSONContent = {
          type: 'doc',
          content: [
            {
              type: 'blockquote',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    { type: 'text', text: 'Quote with image: ' },
                    {
                      type: 'imageResize',
                      attrs: { src: 'https://example.com/img.png', width: 400 },
                    },
                  ],
                },
              ],
            },
          ],
        };

        const result = migrateInlineImagesToBlock(content);

        // Blockquote should have text paragraph, image is extracted
        expect(result?.content?.[0]?.type).toBe('blockquote');
        expect(result?.content?.[0]?.content?.[0]?.type).toBe('paragraph');
        expect(result?.content?.[0]?.content?.[0]?.content?.[0]?.text).toBe(
          'Quote with image: '
        );
        expect(result?.content?.[1]?.type).toBe('imageResize');
      });

      it('should handle images in bullet lists', () => {
        const content: JSONContent = {
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
                      content: [
                        { type: 'text', text: 'Item with image: ' },
                        {
                          type: 'imageResize',
                          attrs: {
                            src: 'https://example.com/img.png',
                            width: 400,
                          },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        };

        const result = migrateInlineImagesToBlock(content);

        // List item should have text, image extracted
        expect(result?.content?.[0]?.type).toBe('bulletList');
        const listItem = result?.content?.[0]?.content?.[0];
        expect(listItem?.type).toBe('listItem');
        expect(listItem?.content?.[0]?.content?.[0]?.text).toBe(
          'Item with image: '
        );
        expect(result?.content?.[1]?.type).toBe('imageResize');
      });

      it('should handle images in ordered lists', () => {
        const content: JSONContent = {
          type: 'doc',
          content: [
            {
              type: 'orderedList',
              content: [
                {
                  type: 'listItem',
                  content: [
                    {
                      type: 'paragraph',
                      content: [
                        { type: 'text', text: 'Numbered item: ' },
                        {
                          type: 'imageResize',
                          attrs: {
                            src: 'https://example.com/img.png',
                            width: 400,
                          },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        };

        const result = migrateInlineImagesToBlock(content);

        expect(result?.content?.[0]?.type).toBe('orderedList');
        expect(result?.content?.[1]?.type).toBe('imageResize');
      });

      it('should handle images in task lists', () => {
        const content: JSONContent = {
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
                      content: [
                        { type: 'text', text: 'Task with image: ' },
                        {
                          type: 'imageResize',
                          attrs: {
                            src: 'https://example.com/img.png',
                            width: 400,
                          },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        };

        const result = migrateInlineImagesToBlock(content);

        expect(result?.content?.[0]?.type).toBe('taskList');
        expect(result?.content?.[1]?.type).toBe('imageResize');
      });

      it('should handle deeply nested structures', () => {
        const content: JSONContent = {
          type: 'doc',
          content: [
            {
              type: 'blockquote',
              content: [
                {
                  type: 'bulletList',
                  content: [
                    {
                      type: 'listItem',
                      content: [
                        {
                          type: 'paragraph',
                          content: [
                            { type: 'text', text: 'Deeply nested: ' },
                            {
                              type: 'imageResize',
                              attrs: {
                                src: 'https://example.com/img.png',
                                width: 400,
                              },
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        };

        const result = migrateInlineImagesToBlock(content);

        // Image should be extracted to top level
        expect(result?.content?.[0]?.type).toBe('blockquote');
        expect(result?.content?.[1]?.type).toBe('imageResize');
      });
    });

    describe('edge cases', () => {
      it('should handle empty document', () => {
        const content: JSONContent = {
          type: 'doc',
          content: [],
        };

        const result = migrateInlineImagesToBlock(content);
        expect(result).toEqual(content);
      });

      it('should handle paragraph with empty content array', () => {
        const content: JSONContent = {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [],
            },
          ],
        };

        const result = migrateInlineImagesToBlock(content);
        expect(result).toEqual(content);
      });

      it('should handle paragraph without content property', () => {
        const content: JSONContent = {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
            },
          ],
        };

        const result = migrateInlineImagesToBlock(content);
        expect(result).toEqual(content);
      });

      it('should preserve image attributes during extraction', () => {
        const content: JSONContent = {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'imageResize',
                  attrs: {
                    src: 'https://example.com/img.png',
                    width: 480,
                    alt: 'Test image',
                    title: 'A test',
                    containerStyle: 'some-style',
                  },
                },
              ],
            },
          ],
        };

        const result = migrateInlineImagesToBlock(content);

        expect(result?.content?.[0]?.attrs).toEqual({
          src: 'https://example.com/img.png',
          width: 480,
          alt: 'Test image',
          title: 'A test',
          containerStyle: 'some-style',
        });
      });

      it('should preserve text marks during extraction', () => {
        const content: JSONContent = {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'Bold text: ',
                  marks: [{ type: 'bold' }],
                },
                {
                  type: 'imageResize',
                  attrs: { src: 'https://example.com/img.png', width: 400 },
                },
              ],
            },
          ],
        };

        const result = migrateInlineImagesToBlock(content);

        expect(result?.content?.[0]?.content?.[0]?.marks).toEqual([
          { type: 'bold' },
        ]);
      });

      it('should preserve paragraph attributes', () => {
        const content: JSONContent = {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              attrs: { textAlign: 'center' },
              content: [
                { type: 'text', text: 'Centered: ' },
                {
                  type: 'imageResize',
                  attrs: { src: 'https://example.com/img.png', width: 400 },
                },
              ],
            },
          ],
        };

        const result = migrateInlineImagesToBlock(content);

        expect(result?.content?.[0]?.attrs).toEqual({ textAlign: 'center' });
      });

      it('should handle nodes with type undefined', () => {
        const content: JSONContent = {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                { text: 'Text without type' } as JSONContent,
                {
                  type: 'imageResize',
                  attrs: { src: 'https://example.com/img.png', width: 400 },
                },
              ],
            },
          ],
        };

        const result = migrateInlineImagesToBlock(content);

        expect(result?.content).toHaveLength(2);
        expect(result?.content?.[0]?.type).toBe('paragraph');
        expect(result?.content?.[1]?.type).toBe('imageResize');
      });

      it('should handle mentions in paragraphs with images', () => {
        const content: JSONContent = {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'mention',
                  attrs: { id: 'user-123', label: '@john' },
                },
                { type: 'text', text: ' posted: ' },
                {
                  type: 'imageResize',
                  attrs: { src: 'https://example.com/img.png', width: 400 },
                },
              ],
            },
          ],
        };

        const result = migrateInlineImagesToBlock(content);

        expect(result?.content).toHaveLength(2);
        // Paragraph should have mention and text preserved
        expect(result?.content?.[0]?.content).toHaveLength(2);
        expect(result?.content?.[0]?.content?.[0]?.type).toBe('mention');
        expect(result?.content?.[0]?.content?.[1]?.text).toBe(' posted: ');
        expect(result?.content?.[1]?.type).toBe('imageResize');
      });

      it('should handle hard breaks in paragraphs with images', () => {
        const content: JSONContent = {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Line 1' },
                { type: 'hardBreak' },
                { type: 'text', text: 'Line 2' },
                {
                  type: 'imageResize',
                  attrs: { src: 'https://example.com/img.png', width: 400 },
                },
              ],
            },
          ],
        };

        const result = migrateInlineImagesToBlock(content);

        expect(result?.content).toHaveLength(2);
        expect(result?.content?.[0]?.content).toHaveLength(3);
        expect(result?.content?.[0]?.content?.[1]?.type).toBe('hardBreak');
      });
    });
  });

  describe('needsMigration', () => {
    it('should return false for null content', () => {
      expect(needsMigration(null)).toBe(false);
    });

    it('should return false for content without content array', () => {
      const content: JSONContent = { type: 'doc' };
      expect(needsMigration(content)).toBe(false);
    });

    it('should return false for content with no images', () => {
      const content: JSONContent = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Hello' }],
          },
        ],
      };
      expect(needsMigration(content)).toBe(false);
    });

    it('should return false for block-level images', () => {
      const content: JSONContent = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Hello' }],
          },
          {
            type: 'imageResize',
            attrs: { src: 'https://example.com/img.png' },
          },
        ],
      };
      expect(needsMigration(content)).toBe(false);
    });

    it('should return true for inline images in paragraphs', () => {
      const content: JSONContent = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Hello ' },
              {
                type: 'imageResize',
                attrs: { src: 'https://example.com/img.png' },
              },
            ],
          },
        ],
      };
      expect(needsMigration(content)).toBe(true);
    });

    it('should return true for legacy image nodes in paragraphs', () => {
      const content: JSONContent = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Hello ' },
              {
                type: 'image',
                attrs: { src: 'https://example.com/img.png' },
              },
            ],
          },
        ],
      };
      expect(needsMigration(content)).toBe(true);
    });

    it('should return true for nested inline images', () => {
      const content: JSONContent = {
        type: 'doc',
        content: [
          {
            type: 'blockquote',
            content: [
              {
                type: 'paragraph',
                content: [
                  { type: 'text', text: 'Quote: ' },
                  {
                    type: 'imageResize',
                    attrs: { src: 'https://example.com/img.png' },
                  },
                ],
              },
            ],
          },
        ],
      };
      expect(needsMigration(content)).toBe(true);
    });
  });
});
