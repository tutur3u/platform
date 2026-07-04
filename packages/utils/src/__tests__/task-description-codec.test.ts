import type { JSONContent } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import {
  createTaskDescriptionPayload,
  decodeTaskDescriptionYjsState,
  encodeTaskDescriptionYjsState,
  parseMarkdownTaskDescriptionContent,
  parsePersistedTaskDescriptionContent,
  parseTaskDescriptionInput,
  parseTaskDescriptionJson,
  taskDescriptionPlainText,
  taskDescriptionYjsStateFromBase64,
  taskDescriptionYjsStateFromBytesJson,
  taskDescriptionYjsStateToBase64,
} from '../task-description-codec';

function findNode(
  content: JSONContent | undefined,
  type: string
): JSONContent | undefined {
  if (!content) return undefined;
  if (content.type === type) return content;

  for (const child of content.content ?? []) {
    const match = findNode(child, type);
    if (match) return match;
  }
}

function cellTexts(row: JSONContent | undefined) {
  return (row?.content ?? []).map((cell) =>
    taskDescriptionPlainText({
      content: cell.content ?? [],
      type: 'doc',
    })
  );
}

describe('task description codec', () => {
  it('creates storage payloads from plain text', () => {
    const payload = createTaskDescriptionPayload(
      'First paragraph\n\nSecond paragraph'
    );

    expect(payload.description).toContain('First paragraph');
    expect(payload.description_yjs_state?.length ?? 0).toBeGreaterThan(0);
    expect(taskDescriptionPlainText(payload.content)).toContain(
      'Second paragraph'
    );
  });

  it('parses common markdown blocks into TipTap content', () => {
    const content = parseMarkdownTaskDescriptionContent(
      [
        '# Release notes',
        '',
        '- [x] Confirm CLI auth',
        '- [ ] Ship task descriptions',
        '',
        '> Keep this scoped',
        '',
        'Visit [Tuturuuu](https://tuturuuu.com) with **bold** text.',
        '',
        '```ts',
        'const shipped = true;',
        '```',
      ].join('\n')
    );

    const plainText = taskDescriptionPlainText(content);

    expect(plainText).toContain('# Release notes');
    expect(plainText).toContain('[x] Confirm CLI auth');
    expect(plainText).toContain('> Keep this scoped');
    expect(plainText).toContain('const shipped = true;');
  });

  it('parses GFM pipe tables into TipTap table nodes', () => {
    const content = parseTaskDescriptionInput(
      [
        '| **Item** | Owner |',
        '| :--- | ---: |',
        '| API | [Sam](https://example.com) |',
        '| CLI | `ttr` |',
      ].join('\n'),
      'markdown'
    );
    const table = findNode(content, 'table');
    const rows = table?.content ?? [];

    expect(table).toBeDefined();
    expect(rows).toHaveLength(3);
    expect(rows[0]?.content?.map((cell) => cell.type)).toEqual([
      'tableHeader',
      'tableHeader',
    ]);
    expect(cellTexts(rows[0])).toEqual(['Item', 'Owner']);
    expect(cellTexts(rows[1])).toEqual(['API', 'Sam']);

    const firstHeaderText = rows[0]?.content?.[0]?.content?.[0]?.content?.[0];
    expect(firstHeaderText).toMatchObject({
      marks: [expect.objectContaining({ type: 'bold' })],
      text: 'Item',
      type: 'text',
    });
  });

  it('keeps escaped pipes inside markdown table cells', () => {
    const content = parseTaskDescriptionInput(
      ['Name | Notes', '--- | ---', 'API | Keep A\\|B together'].join('\n'),
      'markdown'
    );
    const table = findNode(content, 'table');
    const rows = table?.content ?? [];

    expect(cellTexts(rows[1])).toEqual(['API', 'Keep A|B together']);
  });

  it('pads ragged markdown table rows into rectangular table rows', () => {
    const content = parseTaskDescriptionInput(
      [
        '| A | B | C |',
        '| --- | --- | --- |',
        '| 1 | 2 |',
        '| 3 | 4 | 5 | 6 |',
      ].join('\n'),
      'markdown'
    );
    const table = findNode(content, 'table');
    const rows = table?.content ?? [];

    expect(rows.map((row) => row.content?.length)).toEqual([4, 4, 4]);
    expect(cellTexts(rows[1])).toEqual(['1', '2', '', '']);
    expect(cellTexts(rows[2])).toEqual(['3', '4', '5', '6']);
  });

  it('keeps non-table pipe text as paragraph text', () => {
    const content = parseTaskDescriptionInput(
      ['This mentions A | B as text.', 'There is no delimiter row.'].join('\n'),
      'markdown'
    );

    expect(findNode(content, 'table')).toBeUndefined();
    expect(taskDescriptionPlainText(content)).toContain('A | B as text');
  });

  it('round-trips markdown tables through Yjs state', () => {
    const payload = createTaskDescriptionPayload(
      ['| Field | Value |', '| --- | --- |', '| Priority | High |'].join('\n'),
      'markdown'
    );
    const decoded = decodeTaskDescriptionYjsState(
      payload.description_yjs_state ?? []
    );
    const table = findNode(decoded, 'table');
    const rows = table?.content ?? [];

    expect(table).toBeDefined();
    expect(cellTexts(rows[1])).toEqual(['Priority', 'High']);
  });

  it('round-trips TipTap content through Yjs base64', () => {
    const content = parseTaskDescriptionInput(
      JSON.stringify({
        content: [
          {
            attrs: { level: 2 },
            content: [{ text: 'Task heading', type: 'text' }],
            type: 'heading',
          },
        ],
        type: 'doc',
      }),
      'json'
    );
    const yjsState = encodeTaskDescriptionYjsState(content);
    const encoded = taskDescriptionYjsStateToBase64(yjsState);
    const decoded = decodeTaskDescriptionYjsState(
      taskDescriptionYjsStateFromBase64(encoded ?? '')
    );

    expect(taskDescriptionPlainText(decoded)).toContain('Task heading');
  });

  it('rejects explicit non-doc JSON input', () => {
    expect(() => parseTaskDescriptionJson('{"text":"not a doc"}')).toThrow(
      /TipTap doc/
    );
  });

  it('validates bytes JSON input', () => {
    expect(taskDescriptionYjsStateFromBytesJson('[1,2,255]')).toEqual([
      1, 2, 255,
    ]);
    expect(() => taskDescriptionYjsStateFromBytesJson('[1,999]')).toThrow(
      /array of byte/
    );
  });

  it('prefers persisted Yjs state over stale description JSON', () => {
    const fresh = createTaskDescriptionPayload('Fresh state');
    const content = parsePersistedTaskDescriptionContent({
      description: JSON.stringify({
        content: [
          {
            content: [{ text: 'Stale projection', type: 'text' }],
            type: 'paragraph',
          },
        ],
        type: 'doc',
      }),
      description_yjs_state: fresh.description_yjs_state,
    });

    expect(taskDescriptionPlainText(content)).toContain('Fresh state');
  });
});
