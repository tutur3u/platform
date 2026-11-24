import { act, render, waitFor } from '@testing-library/react';
import type { Editor, JSONContent } from '@tiptap/react';
import { expect, it, vi } from 'vitest';
import { RichTextEditor } from './editor';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('./tool-bar', () => ({
  FixedToolbar: () => null,
  ToolBar: () => null,
}));
vi.mock('./task-item-checkbox', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./task-item-checkbox')>()),
  useMentionedTaskStatuses: () => ({ data: [] }),
}));

const doc = (text: string): JSONContent => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

it('skips content syncs into a destroyed editor', async () => {
  const editorRef: { current: Editor | null } = { current: null };
  const { rerender } = render(
    <RichTextEditor content={doc('First')} editorRef={editorRef} />
  );
  await act(async () => {});
  await waitFor(() => expect(editorRef.current).not.toBeNull());
  const editor = editorRef.current!;

  // The panel closes and tears the editor down while new content for the
  // same render is still on its way.
  act(() => {
    editor.destroy();
  });
  expect(editor.isDestroyed).toBe(true);

  expect(() =>
    rerender(<RichTextEditor content={doc('Second')} editorRef={editorRef} />)
  ).not.toThrow();
});
