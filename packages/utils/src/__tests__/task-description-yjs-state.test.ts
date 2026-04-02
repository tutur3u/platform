import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { deriveTaskDescriptionYjsState } from '../yjs-task-description';

const fullFeaturedDescription = readFileSync(
  join(
    process.cwd(),
    'src',
    '__tests__',
    'fixtures',
    'task-description-full-featured.json'
  ),
  'utf8'
);

describe('deriveTaskDescriptionYjsState', () => {
  it('returns null for empty descriptions', () => {
    expect(deriveTaskDescriptionYjsState(null)).toBeNull();
    expect(deriveTaskDescriptionYjsState(undefined)).toBeNull();
    expect(deriveTaskDescriptionYjsState('')).toBeNull();
    expect(deriveTaskDescriptionYjsState('   ')).toBeNull();
  });

  it('derives yjs state from plain text', () => {
    const state = deriveTaskDescriptionYjsState(
      'Mobile plain text description'
    );

    expect(state).not.toBeNull();
    expect(Array.isArray(state)).toBe(true);
    expect(state?.length ?? 0).toBeGreaterThan(0);
  });

  it('derives yjs state from TipTap JSON descriptions', () => {
    const state = deriveTaskDescriptionYjsState(
      JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'Task heading' }],
          },
          {
            type: 'taskList',
            content: [
              {
                type: 'taskItem',
                attrs: { checked: true },
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Checked item' }],
                  },
                ],
              },
            ],
          },
        ],
      })
    );

    expect(state).not.toBeNull();
    expect(state?.length ?? 0).toBeGreaterThan(0);
  });

  it('falls back to plain text conversion for unsupported JSON nodes', () => {
    const state = deriveTaskDescriptionYjsState(
      JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'unsupportedNodeType',
            content: [{ type: 'text', text: 'fallback text' }],
          },
        ],
      })
    );

    expect(state).not.toBeNull();
    expect(state?.length ?? 0).toBeGreaterThan(0);
  });

  it('handles full-featured web editor payloads', () => {
    const state = deriveTaskDescriptionYjsState(fullFeaturedDescription);

    expect(state).not.toBeNull();
    expect(state?.length ?? 0).toBeGreaterThan(0);
  });

  it('transforms legacy image nodes to imageResize for schema compatibility', () => {
    const state = deriveTaskDescriptionYjsState(
      JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'image',
            attrs: {
              src: '/api/v1/workspaces/ws-1/storage/share?path=task-images%2Ftask-1%2Fimage.png',
              alt: 'Test image',
              title: 'Test',
            },
          },
        ],
      })
    );

    expect(state).not.toBeNull();
    expect(state?.length ?? 0).toBeGreaterThan(0);
  });

  it('transforms nested image nodes inside complex structures', () => {
    const state = deriveTaskDescriptionYjsState(
      JSON.stringify({
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
                    attrs: {
                      src: '/api/v1/workspaces/ws-1/storage/share?path=task-images%2Ftask-1%2Fnested.png',
                      alt: null,
                      title: null,
                    },
                  },
                ],
              },
            ],
          },
        ],
      })
    );

    expect(state).not.toBeNull();
    expect(state?.length ?? 0).toBeGreaterThan(0);
  });

  it('handles image nodes alongside other supported nodes', () => {
    const state = deriveTaskDescriptionYjsState(
      JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: 'Image Test' }],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Description with ' }],
          },
          {
            type: 'image',
            attrs: {
              src: '/api/v1/workspaces/ws-1/storage/share?path=task-images%2Ftask-1%2Fhero.png',
              alt: 'Hero image',
              title: 'Hero',
              width: 800,
              height: null,
            },
          },
          {
            type: 'taskList',
            content: [
              {
                type: 'taskItem',
                attrs: { checked: false },
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Task with image above' }],
                  },
                ],
              },
            ],
          },
        ],
      })
    );

    expect(state).not.toBeNull();
    expect(state?.length ?? 0).toBeGreaterThan(0);
  });

  it('handles video and youtube nodes without errors', () => {
    const state = deriveTaskDescriptionYjsState(
      JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'video',
            attrs: {
              src: '/api/v1/workspaces/ws-1/storage/share?path=task-images%2Ftask-1%2Fvideo.mp4',
            },
          },
          {
            type: 'youtube',
            attrs: {
              src: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
              videoId: 'dQw4w9WgXcQ',
            },
          },
        ],
      })
    );

    expect(state).not.toBeNull();
    expect(state?.length ?? 0).toBeGreaterThan(0);
  });

  it('handles mixed imageResize and legacy image nodes in same document', () => {
    const state = deriveTaskDescriptionYjsState(
      JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'imageResize',
            attrs: {
              src: '/api/v1/workspaces/ws-1/storage/share?path=task-images%2Ftask-1%2Fnew.png',
              alt: 'New image',
              title: null,
              width: 600,
              height: null,
            },
          },
          {
            type: 'image',
            attrs: {
              src: '/api/v1/workspaces/ws-1/storage/share?path=task-images%2Ftask-1%2Flegacy.png',
              alt: 'Legacy image',
              title: null,
            },
          },
        ],
      })
    );

    expect(state).not.toBeNull();
    expect(state?.length ?? 0).toBeGreaterThan(0);
  });

  it('returns null when description is only whitespace characters', () => {
    expect(deriveTaskDescriptionYjsState('   \n\n   ')).toBeNull();
  });

  it('handles deeply nested list structures', () => {
    const state = deriveTaskDescriptionYjsState(
      JSON.stringify({
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
                    content: [{ type: 'text', text: 'Level 1' }],
                  },
                  {
                    type: 'bulletList',
                    content: [
                      {
                        type: 'listItem',
                        content: [
                          {
                            type: 'paragraph',
                            content: [{ type: 'text', text: 'Level 2' }],
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
      })
    );

    expect(state).not.toBeNull();
    expect(state?.length ?? 0).toBeGreaterThan(0);
  });

  it('handles table with various cell content types', () => {
    const state = deriveTaskDescriptionYjsState(
      JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'table',
            content: [
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableHeader',
                    attrs: { colspan: 1, rowspan: 1, colwidth: null },
                    content: [
                      {
                        type: 'paragraph',
                        content: [{ type: 'text', text: 'Header A' }],
                      },
                    ],
                  },
                  {
                    type: 'tableCell',
                    attrs: { colspan: 1, rowspan: 1, colwidth: null },
                    content: [
                      {
                        type: 'paragraph',
                        content: [{ type: 'text', text: 'Cell B' }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      })
    );

    expect(state).not.toBeNull();
    expect(state?.length ?? 0).toBeGreaterThan(0);
  });

  it('handles mention nodes with all attribute variations', () => {
    const state = deriveTaskDescriptionYjsState(
      JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'mention',
                attrs: {
                  id: 'user-1',
                  label: 'John Doe',
                  userId: 'user-1',
                  entityId: 'user-1',
                  entityType: 'user',
                  displayName: 'John Doe',
                  avatarUrl: 'https://example.com/avatar.png',
                  subtitle: 'Engineer',
                  priority: null,
                  listColor: null,
                  assignees: null,
                },
              },
            ],
          },
        ],
      })
    );

    expect(state).not.toBeNull();
    expect(state?.length ?? 0).toBeGreaterThan(0);
  });

  it('handles text with all mark types', () => {
    const state = deriveTaskDescriptionYjsState(
      JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                marks: [{ type: 'bold' }],
                text: 'Bold',
              },
              { type: 'text', marks: [{ type: 'italic' }], text: 'Italic' },
              { type: 'text', marks: [{ type: 'strike' }], text: 'Strike' },
              {
                type: 'text',
                marks: [{ type: 'underline' }],
                text: 'Underline',
              },
              { type: 'text', marks: [{ type: 'code' }], text: 'Code' },
              {
                type: 'text',
                marks: [{ type: 'subscript' }],
                text: 'Sub',
              },
              {
                type: 'text',
                marks: [{ type: 'superscript' }],
                text: 'Super',
              },
              {
                type: 'text',
                marks: [{ type: 'highlight', attrs: { color: '#FFF59D' } }],
                text: 'Highlight',
              },
              {
                type: 'text',
                marks: [
                  {
                    type: 'link',
                    attrs: {
                      href: 'https://example.com',
                      target: '_blank',
                      rel: 'noopener noreferrer',
                      class: 'link',
                      title: null,
                    },
                  },
                ],
                text: 'Link',
              },
            ],
          },
        ],
      })
    );

    expect(state).not.toBeNull();
    expect(state?.length ?? 0).toBeGreaterThan(0);
  });

  it('handles horizontal rule nodes', () => {
    const state = deriveTaskDescriptionYjsState(
      JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Before' }],
          },
          { type: 'horizontalRule' },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'After' }],
          },
        ],
      })
    );

    expect(state).not.toBeNull();
    expect(state?.length ?? 0).toBeGreaterThan(0);
  });

  it('handles blockquote with mixed content', () => {
    const state = deriveTaskDescriptionYjsState(
      JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'blockquote',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    marks: [{ type: 'italic' }],
                    text: 'Quoted text',
                  },
                ],
              },
              {
                type: 'bulletList',
                content: [
                  {
                    type: 'listItem',
                    content: [
                      {
                        type: 'paragraph',
                        content: [{ type: 'text', text: 'Item in quote' }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      })
    );

    expect(state).not.toBeNull();
    expect(state?.length ?? 0).toBeGreaterThan(0);
  });
});
