import { Editor, generateHTML, generateJSON } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { getEditorExtensions } from '../extensions';

const editors: Editor[] = [];

function createEditor(content: Record<string, unknown>) {
  const editor = new Editor({
    content,
    extensions: getEditorExtensions(),
  });
  editors.push(editor);
  return editor;
}

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

describe('toggle blocks', () => {
  it('registers the native details schema and toggle command extension', () => {
    const names = getEditorExtensions().map((extension) => extension.name);

    expect(names).toEqual(
      expect.arrayContaining([
        'details',
        'detailsSummary',
        'detailsContent',
        'toggleBlock',
      ])
    );
  });

  it('turns a paragraph into an open toggle list and restores it', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Deployment notes' }],
        },
      ],
    });
    editor.commands.setTextSelection(3);

    expect(editor.commands.toggleDetailsBlock()).toBe(true);
    expect(editor.getJSON()).toEqual({
      type: 'doc',
      content: [
        {
          type: 'details',
          attrs: { open: true },
          content: [
            {
              type: 'detailsSummary',
              attrs: { level: null },
              content: [{ type: 'text', text: 'Deployment notes' }],
            },
            {
              type: 'detailsContent',
              content: [{ type: 'paragraph', attrs: { textAlign: null } }],
            },
          ],
        },
        { type: 'paragraph', attrs: { textAlign: null } },
      ],
    });

    expect(editor.commands.toggleDetailsBlock()).toBe(true);
    expect(editor.getJSON()).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { textAlign: null },
          content: [{ type: 'text', text: 'Deployment notes' }],
        },
        { type: 'paragraph', attrs: { textAlign: null } },
        { type: 'paragraph', attrs: { textAlign: null } },
      ],
    });
  });

  it.each([1, 2, 3] as const)(
    'preserves heading %i semantics through toggle and untoggle',
    (level) => {
      const editor = createEditor({
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level, textAlign: null },
            content: [{ type: 'text', text: `Heading ${level}` }],
          },
        ],
      });
      editor.commands.setTextSelection(3);

      expect(editor.commands.toggleDetailsBlock()).toBe(true);
      const details = editor.getJSON().content?.[0];
      expect(details).toMatchObject({ type: 'details', attrs: { open: true } });
      expect(details?.content?.[0]).toEqual({
        type: 'detailsSummary',
        attrs: { level },
        content: [{ type: 'text', text: `Heading ${level}` }],
      });

      expect(editor.commands.toggleDetailsBlock()).toBe(true);
      expect(editor.getJSON().content?.[0]).toMatchObject({
        type: 'heading',
        attrs: { level },
        content: [{ type: 'text', text: `Heading ${level}` }],
      });
    }
  );

  it('keeps selected trailing blocks inside the toggle body', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2, textAlign: null },
          content: [{ type: 'text', text: 'Summary' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'First detail' }],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Nested detail' }],
                },
              ],
            },
          ],
        },
      ],
    });
    editor.commands.selectAll();

    expect(editor.commands.toggleDetailsBlock()).toBe(true);
    const details = editor.getJSON().content?.[0];
    expect(details?.content?.[1]?.type).toBe('detailsContent');
    expect(details?.content?.[1]).toMatchObject({
      content: [
        { type: 'paragraph' },
        { type: 'bulletList' },
        { type: 'paragraph' },
      ],
    });
  });

  it('round-trips persisted open state and toggle heading level through HTML', () => {
    const json = {
      type: 'doc',
      content: [
        {
          type: 'details',
          attrs: { open: true },
          content: [
            {
              type: 'detailsSummary',
              attrs: { level: 2 },
              content: [{ type: 'text', text: 'Expandable heading' }],
            },
            {
              type: 'detailsContent',
              content: [
                {
                  type: 'paragraph',
                  attrs: { textAlign: null },
                  content: [{ type: 'text', text: 'Hidden details' }],
                },
              ],
            },
          ],
        },
      ],
    };
    const extensions = getEditorExtensions();
    const html = generateHTML(json, extensions);

    expect(html).toContain('<details');
    expect(html).toContain('open=""');
    expect(html).toContain('data-heading-level="2"');
    expect(generateJSON(html, extensions)).toEqual(json);
  });

  it('persists collapse and expand interactions from the rendered toggle button', () => {
    const element = document.createElement('div');
    document.body.append(element);
    const editor = new Editor({
      element,
      extensions: getEditorExtensions(),
      content: {
        type: 'doc',
        content: [
          {
            type: 'details',
            attrs: { open: false },
            content: [
              {
                type: 'detailsSummary',
                attrs: { level: null },
                content: [{ type: 'text', text: 'More information' }],
              },
              {
                type: 'detailsContent',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Hidden initially' }],
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    editors.push(editor);

    const button = element.querySelector<HTMLButtonElement>(
      '.toggle-details-button'
    );
    const body = element.querySelector<HTMLElement>(
      '[data-type="detailsContent"]'
    );
    expect(button?.getAttribute('aria-expanded')).toBe('false');
    expect(body).toHaveAttribute('hidden');

    button?.click();
    expect(editor.getJSON().content?.[0]?.attrs?.open).toBe(true);
    expect(button?.getAttribute('aria-expanded')).toBe('true');
    expect(body).not.toHaveAttribute('hidden');

    button?.click();
    expect(editor.getJSON().content?.[0]?.attrs?.open).toBe(false);
    expect(button?.getAttribute('aria-expanded')).toBe('false');
    expect(body).toHaveAttribute('hidden');

    element.remove();
  });
});
