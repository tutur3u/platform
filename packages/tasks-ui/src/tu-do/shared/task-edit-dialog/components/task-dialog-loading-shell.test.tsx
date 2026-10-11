import { fireEvent, render, screen } from '@testing-library/react';
import { createRef, useEffect, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TaskDialogLoadingShell } from './task-dialog-loading-shell';
import { TaskNameInput } from './task-name-input';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

describe('task dialog loading layout', () => {
  it('reserves title, details and description while delayed content is unavailable', () => {
    const { container, rerender } = render(
      <TaskDialogLoadingShell loading>
        <span>Placeholder values</span>
      </TaskDialogLoadingShell>
    );
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(screen.getByText('Placeholder values')).not.toBeVisible();
    expect(container.querySelector('[inert]')).toBeTruthy();
    expect(container.querySelector('[data-task-dialog-skeleton]')).toBeTruthy();
    rerender(
      <TaskDialogLoadingShell loading={false}>
        <span>Loaded description</span>
      </TaskDialogLoadingShell>
    );
    expect(screen.getByText('Loaded description')).toBeVisible();
    expect(container.querySelector('[data-task-dialog-skeleton]')).toBeNull();
    expect(container.querySelector('[inert]')).toBeNull();
  });

  it('defers title focus until loading ends and does not refocus after interaction', () => {
    const titleInputRef = createRef<HTMLInputElement | HTMLTextAreaElement>();
    const editorRef = createRef<HTMLDivElement>();
    const cursorRef = createRef<number>();
    const props = {
      name: 'Loaded task',
      isCreateMode: false,
      titleInputRef,
      editorRef,
      lastCursorPositionRef: cursorRef,
      targetEditorCursorRef: cursorRef,
      setName: vi.fn(),
      updateName: vi.fn(),
      flushNameUpdate: vi.fn(),
    };
    const { rerender } = render(
      <TaskDialogLoadingShell loading>
        <TaskNameInput {...props} disabled />
      </TaskDialogLoadingShell>
    );
    expect(titleInputRef.current).not.toHaveFocus();
    rerender(
      <TaskDialogLoadingShell loading={false}>
        <TaskNameInput {...props} disabled={false} />
      </TaskDialogLoadingShell>
    );
    expect(titleInputRef.current).toHaveFocus();
    titleInputRef.current?.blur();
    rerender(
      <TaskDialogLoadingShell loading={false}>
        <TaskNameInput {...props} disabled={false} name="Edited task" />
      </TaskDialogLoadingShell>
    );
    expect(titleInputRef.current).not.toHaveFocus();
  });

  it('retains the editor instance and unsaved content across settling and reopening', () => {
    const mounted = vi.fn();
    const unmounted = vi.fn();
    function EditorFixture() {
      const [value, setValue] = useState('Saved');
      useEffect(() => {
        mounted();
        return unmounted;
      }, []);
      return (
        <input
          aria-label="Description"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      );
    }
    const { rerender } = render(
      <TaskDialogLoadingShell loading={false}>
        <EditorFixture />
      </TaskDialogLoadingShell>
    );
    const editor = screen.getByRole('textbox');
    fireEvent.change(editor, { target: { value: 'Unsaved edit' } });
    rerender(
      <TaskDialogLoadingShell loading>
        <EditorFixture />
      </TaskDialogLoadingShell>
    );
    expect(editor).not.toBeVisible();
    rerender(
      <TaskDialogLoadingShell loading={false}>
        <EditorFixture />
      </TaskDialogLoadingShell>
    );
    expect(screen.getByRole('textbox')).toBe(editor);
    expect(editor).toHaveValue('Unsaved edit');
    expect(mounted).toHaveBeenCalledTimes(1);
    expect(unmounted).not.toHaveBeenCalled();
  });
});
