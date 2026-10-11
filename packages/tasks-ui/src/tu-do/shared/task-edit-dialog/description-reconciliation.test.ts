import { render, waitFor } from '@testing-library/react';
import { Schema } from '@tiptap/pm/model';
import type { Editor, JSONContent } from '@tiptap/react';
import { RichTextEditor } from '@tuturuuu/ui/text-editor/editor';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import {
  areTaskDescriptionsEquivalent,
  getTaskDescriptionRecoveryVersion,
} from './description-reconciliation';
import { buildRecoverableTaskDescriptionVersions } from './description-versions';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      attrs: { textAlign: { default: null } },
    },
    text: { group: 'inline' },
    mention: {
      group: 'inline',
      inline: true,
      attrs: { entityId: {}, entityType: {} },
    },
  },
  marks: { bold: {}, italic: {} },
});

function description(text: string): JSONContent {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  };
}
const saved = description('Current description');
const versions = buildRecoverableTaskDescriptionVersions([
  {
    id: 'change',
    changed_at: '2026-10-09T00:00:00Z',
    change_type: 'field_updated',
    field_name: 'description',
    new_value: saved,
    old_value: description('Older version'),
  },
]);
const resolve = (
  currentContent: JSONContent | null,
  persistedContent: JSONContent | null = saved,
  isSettling = false
) =>
  getTaskDescriptionRecoveryVersion({
    versions,
    currentContent,
    persistedContent,
    baselineContent: saved,
    isSettling,
    schema,
  });

describe('safe task description reconciliation', () => {
  it('reconciles editor-filled defaults and object key ordering without changing content', () => {
    const editorSnapshot: JSONContent = {
      content: [
        {
          attrs: { textAlign: null },
          content: [{ text: 'Current description', type: 'text' }],
          type: 'paragraph',
        },
      ],
      type: 'doc',
    };
    const before = JSON.stringify(editorSnapshot);
    expect(JSON.stringify(editorSnapshot)).not.toBe(versions[0]?.description);
    expect(areTaskDescriptionsEquivalent(editorSnapshot, saved, schema)).toBe(
      true
    );
    expect(resolve(editorSnapshot)).toBeNull();
    expect(JSON.stringify(editorSnapshot)).toBe(before);
  });

  it('reconciles the actual task editor schema snapshot without changing formatting or media', async () => {
    let editor: Editor | undefined;
    render(
      createElement(RichTextEditor, {
        content: saved,
        readOnly: true,
        onEditorReady: (readyEditor) => {
          editor = readyEditor;
        },
      })
    );
    await waitFor(() => expect(editor).toBeDefined());
    const editorSchema = editor!.schema;
    const editorSnapshot = editorSchema.nodeFromJSON(saved).toJSON();
    expect(JSON.stringify(editorSnapshot)).not.toBe(JSON.stringify(saved));
    expect(
      areTaskDescriptionsEquivalent(saved, editorSnapshot, editorSchema)
    ).toBe(true);
    const marked = description('Current description');
    marked.content![0]!.content![0]!.marks = [{ type: 'bold' }];
    expect(areTaskDescriptionsEquivalent(saved, marked, editorSchema)).toBe(
      false
    );
    const image = (src: string): JSONContent => ({
      type: 'doc',
      content: [{ type: 'image', attrs: { src } }],
    });
    expect(
      areTaskDescriptionsEquivalent(
        image('a.png'),
        image('b.png'),
        editorSchema
      )
    ).toBe(false);
  });

  it('preserves unsaved edits when the tracked version is already current on the server', () => {
    const edits = description('My unsaved edits');
    const before = JSON.stringify(edits);
    expect(resolve(edits)).toBeNull();
    expect(JSON.stringify(edits)).toBe(before);
    expect(versions).toHaveLength(2);
  });

  it('waits for delayed task/Yjs content and reconciles the same current version on reopen', () => {
    expect(resolve(null, null, true)).toBeNull();
    expect(resolve(saved)).toBeNull();
    expect(resolve(null, null, true)).toBeNull();
    expect(resolve(saved)).toBeNull();
  });

  it('keeps genuine divergence available for explicit comparison or restore', () => {
    const diverged = description('Different collaborative content');
    expect(resolve(diverged, diverged)).toBe(versions[0]);
    expect(resolve(null, null)).toBe(versions[0]);
  });

  it('preserves a divergent hydrated Yjs baseline even when the row and history match', () => {
    const yjsContent = description('Different durable Yjs content');
    expect(
      getTaskDescriptionRecoveryVersion({
        versions,
        currentContent: yjsContent,
        persistedContent: saved,
        baselineContent: yjsContent,
        isSettling: false,
        schema,
      })
    ).toBe(versions[0]);
    expect(
      getTaskDescriptionRecoveryVersion({
        versions,
        currentContent: yjsContent,
        persistedContent: saved,
        isSettling: false,
        schema,
      })
    ).toBe(versions[0]);
  });

  it('recognizes an in-session confirmed save A to B before unsaved edit C', () => {
    const savedB = description('Confirmed B');
    const editC = description('Unsaved C');
    const historyB = buildRecoverableTaskDescriptionVersions([
      {
        id: 'saved-b',
        changed_at: '2026-10-09T00:01:00Z',
        change_type: 'field_updated',
        field_name: 'description',
        old_value: saved,
        new_value: savedB,
      },
    ]);
    expect(
      getTaskDescriptionRecoveryVersion({
        versions: historyB,
        currentContent: editC,
        persistedContent: saved,
        baselineContent: saved,
        confirmedSavedContent: savedB,
        isSettling: false,
        schema,
      })
    ).toBeNull();
    expect(
      getTaskDescriptionRecoveryVersion({
        versions: historyB,
        currentContent: editC,
        persistedContent: saved,
        baselineContent: saved,
        isSettling: false,
        schema,
      })
    ).toBe(historyB[0]);
    expect(editC).toEqual(description('Unsaved C'));
  });

  it('keeps pre-clear history available after an intentional clear', () => {
    const beforeClear = buildRecoverableTaskDescriptionVersions([
      {
        id: 'clear',
        changed_at: '2026-10-09T00:00:00Z',
        change_type: 'field_updated',
        field_name: 'description',
        new_value: null,
        old_value: saved,
      },
    ]);
    expect(
      getTaskDescriptionRecoveryVersion({
        versions: beforeClear,
        currentContent: null,
        persistedContent: null,
        isSettling: false,
        schema,
      })
    ).toBe(beforeClear[0]);
  });

  it('does not discard formatting, alignment, whitespace, or mention identity', () => {
    const bold = description('Current description');
    bold.content![0]!.content![0]!.marks = [{ type: 'bold' }];
    const centered = description('Current description');
    centered.content![0]!.attrs = { textAlign: 'center' };
    expect(areTaskDescriptionsEquivalent(saved, bold, schema)).toBe(false);
    expect(areTaskDescriptionsEquivalent(saved, centered, schema)).toBe(false);
    expect(
      areTaskDescriptionsEquivalent(
        saved,
        description('Current description '),
        schema
      )
    ).toBe(false);
    const mention = (entityId: string): JSONContent => ({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'mention', attrs: { entityId, entityType: 'task' } },
          ],
        },
      ],
    });
    expect(
      areTaskDescriptionsEquivalent(mention('a'), mention('b'), schema)
    ).toBe(false);
  });

  it('fails closed on unsupported attributes/nodes and malformed content', () => {
    const unknown = description('Current description');
    unknown.content![0]!.attrs = { futureAttribute: 'keep me' };
    expect(areTaskDescriptionsEquivalent(saved, unknown, schema)).toBe(false);
    expect(
      areTaskDescriptionsEquivalent(
        saved,
        { ...saved, type: 'futureDoc' },
        schema
      )
    ).toBe(false);
    expect(
      areTaskDescriptionsEquivalent(
        saved,
        {
          type: 'doc',
          content: [{ type: 'text', text: 'Current description' }],
        },
        schema
      )
    ).toBe(false);
  });
});
