import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
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

it('removes click-blocking classes after sync without recreating the editor', async () => {
  const editorRef: { current: Editor | null } = { current: null };
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
                content: [{ type: 'text', text: 'Checklist' }],
              },
            ],
          },
        ],
      },
    ],
  };
  const onImmediateChange = vi.fn();
  const { rerender } = render(
    <RichTextEditor
      content={content}
      editorRef={editorRef}
      readOnly
      onImmediateChange={onImmediateChange}
    />
  );
  await act(async () => {});
  await waitFor(() => expect(editorRef.current).not.toBeNull());
  const original = editorRef.current!;
  expect(original.view.dom.className).toContain(
    '[&_.task-list-checkbox]:!pointer-events-none'
  );
  rerender(
    <RichTextEditor
      content={content}
      editorRef={editorRef}
      readOnly={false}
      onImmediateChange={onImmediateChange}
    />
  );
  await act(async () => {});
  expect(editorRef.current).toBe(original);
  expect(original.isEditable).toBe(true);
  expect(original.view.dom.className).not.toContain(
    '[&_.task-list-checkbox]:!pointer-events-none'
  );
  for (const state of ['indeterminate', true, false]) {
    fireEvent.click(screen.getByRole('checkbox', { name: 'status' }));
    expect(original.state.doc.firstChild?.firstChild?.attrs.checked).toBe(
      state
    );
  }
  expect(onImmediateChange).toHaveBeenCalled();
  rerender(<RichTextEditor content={content} editorRef={editorRef} readOnly />);
  await act(async () => {});
  expect(original.isEditable).toBe(false);
  expect(original.view.dom.className).toContain(
    '[&_.task-list-checkbox]:!pointer-events-none'
  );
});
