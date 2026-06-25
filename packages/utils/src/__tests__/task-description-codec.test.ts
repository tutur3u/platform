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
