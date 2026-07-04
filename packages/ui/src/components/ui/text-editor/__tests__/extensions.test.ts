import { generateHTML, generateJSON } from '@tiptap/core';
import type SupabaseProvider from '@tuturuuu/ui/hooks/supabase-provider';
import { parseTaskDescriptionInput } from '@tuturuuu/utils/task-description-codec';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { getEditorExtensions } from '../extensions';
import { Mention } from '../mention-extension';

function extensionNames(options: Parameters<typeof getEditorExtensions>[0]) {
  return getEditorExtensions(options).map((extension) => extension.name);
}

describe('text editor extensions', () => {
  it('keeps Yjs document sync available without anonymous collaboration carets', () => {
    const names = extensionNames({
      doc: new Y.Doc(),
      provider: {} as SupabaseProvider,
    });

    expect(names).toContain('collaboration');
    expect(names).not.toContain('collaborationCaret');
  });

  it('enables collaboration carets only when a named user is available', () => {
    const names = extensionNames({
      doc: new Y.Doc(),
      provider: {} as SupabaseProvider,
      collaborationUser: {
        id: 'user-1',
        name: 'User One',
        color: '#3b82f6',
      },
    });

    expect(names).toContain('collaboration');
    expect(names).toContain('collaborationCaret');
  });

  it('registers theme-aware highlight, text color, and background color extensions', () => {
    const names = extensionNames({});

    expect(names).toContain('highlight');
    expect(names).toContain('textStyle');
    expect(names).toContain('color');
    expect(names).toContain('backgroundColor');
  });

  it('round-trips theme-aware highlight, text color, and background color marks', () => {
    const extensions = getEditorExtensions();
    const content = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { textAlign: null },
          content: [
            {
              type: 'text',
              marks: [
                {
                  type: 'highlight',
                  attrs: {
                    color: 'var(--calendar-bg-yellow)',
                    textColor: 'var(--yellow)',
                  },
                },
              ],
              text: 'Highlighted',
            },
            { type: 'text', text: ' ' },
            {
              type: 'text',
              marks: [
                {
                  type: 'textStyle',
                  attrs: {
                    color: 'var(--blue)',
                    backgroundColor: 'var(--calendar-bg-blue)',
                  },
                },
              ],
              text: 'Colored',
            },
          ],
        },
      ],
    };

    const html = generateHTML(content, extensions);

    expect(html).toContain('var(--calendar-bg-yellow)');
    expect(html).toContain('var(--yellow)');
    expect(html).toContain('var(--calendar-bg-blue)');
    expect(html).toContain('var(--blue)');

    const parsed = generateJSON(html, extensions);
    const paragraph = parsed.content?.[0];
    const highlightedText = paragraph?.content?.[0];
    const coloredText = paragraph?.content?.[2];

    expect(highlightedText?.marks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'highlight',
          attrs: expect.objectContaining({
            color: 'var(--calendar-bg-yellow)',
            textColor: 'var(--yellow)',
          }),
        }),
      ])
    );
    expect(coloredText?.marks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'textStyle',
          attrs: expect.objectContaining({
            color: 'var(--blue)',
            backgroundColor: 'var(--calendar-bg-blue)',
          }),
        }),
      ])
    );
  });

  it('keeps legacy and raw hex highlight content valid', () => {
    const html = generateHTML(
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: { textAlign: null },
            content: [
              {
                type: 'text',
                marks: [{ type: 'highlight' }],
                text: 'Legacy',
              },
              { type: 'text', text: ' ' },
              {
                type: 'text',
                marks: [
                  {
                    type: 'highlight',
                    attrs: { color: '#FFF59D' },
                  },
                ],
                text: 'Hex',
              },
            ],
          },
        ],
      },
      getEditorExtensions()
    );

    expect(html).toContain('<mark');
    expect(html).toContain('#FFF59D');
  });

  it('renders shared markdown-codec table JSON with editor table extensions', () => {
    const extensions = getEditorExtensions({ readOnly: true });
    const content = parseTaskDescriptionInput(
      ['| Field | Value |', '| --- | --- |', '| Owner | Platform |'].join('\n'),
      'markdown'
    );

    const html = generateHTML(content, extensions);

    expect(html).toContain('<table');
    expect(html).toContain('<th');
    expect(html).toContain('<td');
    expect(html).toContain('Platform');

    const parsed = generateJSON(html, extensions);
    expect(parsed.content?.[0]?.type).toBe('table');
    expect(parsed.content?.[0]?.content?.[0]?.content?.[0]?.type).toBe(
      'tableHeader'
    );
  });

  it('round-trips task mention workspace metadata through HTML attrs', () => {
    const renderOutput = (Mention.config as any).renderHTML({
      HTMLAttributes: {
        entityId: 'task-1',
        entityType: 'task',
        displayName: '42',
        subtitle: 'Cross workspace task',
        workspaceId: 'source-ws',
      },
    }) as any[];

    expect(renderOutput[1]).toHaveProperty('data-workspace-id', 'source-ws');

    const parseRules = (Mention.config as any).parseHTML() as any[];
    const element = document.createElement('span');
    element.dataset.mention = 'true';
    element.dataset.entityId = 'task-1';
    element.dataset.entityType = 'task';
    element.dataset.displayNumber = '42';
    element.dataset.subtitle = 'Cross workspace task';
    element.dataset.workspaceId = 'source-ws';

    expect(parseRules[0]?.getAttrs(element)).toEqual(
      expect.objectContaining({
        entityId: 'task-1',
        entityType: 'task',
        displayName: '42',
        subtitle: 'Cross workspace task',
        workspaceId: 'source-ws',
      })
    );
  });
});
