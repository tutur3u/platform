import { act, fireEvent, render, screen } from '@testing-library/react';
import { TaskList } from '@tiptap/extension-list';
import { type Editor, EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TaskItemCheckbox } from './task-item-checkbox-extension';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('./task-item-checkbox', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./task-item-checkbox')>()),
  useMentionedTaskStatuses: () => ({ data: [] }),
}));

let editor: Editor;
function Harness({ editable = true }: { editable?: boolean }) {
  const instance = useEditor({
    extensions: [StarterKit, TaskList, TaskItemCheckbox],
    content:
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>Checklist text</p></li></ul>',
    editable,
  });
  if (instance) editor = instance;
  return <EditorContent editor={instance} />;
}
const checkbox = () => screen.getByRole('checkbox', { name: 'status' });
const checked = () => editor.state.doc.firstChild?.firstChild?.attrs.checked;
afterEach(() => vi.useRealTimers());

describe('checklist editor interactions', () => {
  it('cycles through all three persisted states with normal clicks', async () => {
    await act(async () => {
      render(<Harness />);
    });
    for (const state of ['indeterminate', true, false]) {
      await act(async () => {
        fireEvent.click(checkbox());
      });
      expect(checked()).toBe(state);
      expect(checkbox()).toHaveAttribute(
        'aria-checked',
        state === 'indeterminate' ? 'mixed' : String(state)
      );
    }
  });

  it('follows undo, redo, and external document updates', async () => {
    await act(async () => {
      render(<Harness />);
    });
    await act(async () => {
      fireEvent.click(checkbox());
    });
    await act(async () => {
      editor.commands.undo();
    });
    expect(checkbox()).toHaveAttribute('aria-checked', 'false');
    await act(async () => {
      editor.commands.redo();
    });
    expect(checkbox()).toHaveAttribute('aria-checked', 'mixed');
    await act(async () => {
      editor.view.dispatch(
        editor.state.tr.setNodeMarkup(1, undefined, { checked: true })
      );
    });
    expect(checkbox()).toHaveAttribute('aria-checked', 'true');
  });

  it('opens a delayed picker and selects a state without moving text selection', async () => {
    vi.useFakeTimers();
    await act(async () => {
      render(<Harness />);
    });
    await act(async () => {
      editor.commands.setTextSelection(4);
    });
    fireEvent.pointerEnter(checkbox().parentElement!);
    await act(async () => {
      vi.advanceTimersByTime(499);
    });
    expect(
      screen.queryByRole('button', { name: 'completed' })
    ).not.toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    fireEvent.click(screen.getByRole('button', { name: 'completed' }));
    expect(checked()).toBe(true);
    expect(editor.state.selection.from).toBe(4);
  });

  it('cancels a brief hover and closes the picker with Escape', async () => {
    vi.useFakeTimers();
    await act(async () => {
      render(<Harness />);
    });
    fireEvent.pointerEnter(checkbox().parentElement!);
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    fireEvent.pointerLeave(checkbox().parentElement!);
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(
      screen.queryByRole('button', { name: 'completed' })
    ).not.toBeInTheDocument();
    fireEvent.keyDown(checkbox(), { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getByRole('button', { name: 'completed' }), {
      key: 'Escape',
    });
    expect(
      screen.queryByRole('button', { name: 'completed' })
    ).not.toBeInTheDocument();
  });

  it('keeps indeterminate state when serializing and reloading the checklist', async () => {
    await act(async () => {
      render(<Harness />);
    });
    await act(async () => {
      fireEvent.click(checkbox());
    });
    const html = editor.getHTML();
    await act(async () => {
      editor.commands.setContent(html);
    });
    expect(checked()).toBe('indeterminate');
    expect(checkbox()).toHaveAttribute('aria-checked', 'mixed');
  });

  it('opens the picker from the keyboard and prevents read-only changes', async () => {
    let unmount = () => {};
    await act(async () => {
      ({ unmount } = render(<Harness />));
    });
    fireEvent.keyDown(checkbox(), { key: 'ArrowDown' });
    expect(
      screen.getByRole('button', { name: 'in_progress' })
    ).toBeInTheDocument();
    unmount();
    await act(async () => {
      render(<Harness editable={false} />);
    });
    await act(async () => {
      fireEvent.click(checkbox());
    });
    fireEvent.keyDown(checkbox(), { key: 'ArrowDown' });
    expect(checked()).toBe(false);
    expect(
      screen.queryByRole('button', { name: 'in_progress' })
    ).not.toBeInTheDocument();
  });
});
