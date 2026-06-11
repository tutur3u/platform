/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskNameInput } from './task-name-input';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

function renderTaskNameInput({
  isCreateMode = true,
  targetCursor = 12,
  variant = 'fullscreen',
  onSubmit,
}: {
  isCreateMode?: boolean;
  targetCursor?: number | null;
  variant?: 'fullscreen' | 'compact';
  onSubmit?: () => void;
} = {}) {
  const editorWrapper = document.createElement('div');
  const editorElement = document.createElement('div');
  editorElement.className = 'ProseMirror';
  editorElement.tabIndex = -1;
  editorWrapper.append(editorElement);

  const titleInputRef = { current: null };
  const editorRef = { current: editorWrapper };
  const lastCursorPositionRef = { current: null };
  const targetEditorCursorRef = { current: targetCursor };
  const props = {
    name: 'APIs for Agent Pi',
    isCreateMode,
    titleInputRef,
    editorRef,
    lastCursorPositionRef,
    targetEditorCursorRef,
    setName: vi.fn(),
    updateName: vi.fn(),
    flushNameUpdate: vi.fn(),
    variant,
    onSubmit,
  };

  render(<TaskNameInput {...props} />);

  return {
    ...props,
    editorElement,
    focusEditor: vi.spyOn(editorElement, 'focus'),
    input: screen.getByPlaceholderText('task_name_placeholder'),
  };
}

describe('TaskNameInput', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('defers focusing the description editor after Enter', () => {
    const { focusEditor, targetEditorCursorRef, input } = renderTaskNameInput();

    const eventAllowed = fireEvent.keyDown(input, { key: 'Enter' });

    expect(eventAllowed).toBe(false);
    expect(targetEditorCursorRef.current).toBe(null);
    expect(focusEditor).not.toHaveBeenCalled();

    vi.runOnlyPendingTimers();

    expect(focusEditor).toHaveBeenCalledTimes(1);
  });

  it('does not move focus while Enter is committing composed text', () => {
    const { focusEditor, targetEditorCursorRef, input } = renderTaskNameInput();

    const eventAllowed = fireEvent.keyDown(input, {
      key: 'Enter',
      keyCode: 229,
    });

    expect(eventAllowed).toBe(true);
    expect(targetEditorCursorRef.current).toBe(12);

    vi.runOnlyPendingTimers();

    expect(focusEditor).not.toHaveBeenCalled();
  });

  it('flushes pending title edits before focusing the editor in edit mode', () => {
    const { flushNameUpdate, focusEditor, input } = renderTaskNameInput({
      isCreateMode: false,
    });

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(flushNameUpdate).toHaveBeenCalledTimes(1);
    expect(focusEditor).not.toHaveBeenCalled();

    vi.runOnlyPendingTimers();

    expect(focusEditor).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['Ctrl+Enter', { ctrlKey: true }],
    ['Cmd+Enter', { metaKey: true }],
  ])('lets %s bubble to the dialog shortcut handler', (_, modifier) => {
    const { flushNameUpdate, focusEditor, targetEditorCursorRef, input } =
      renderTaskNameInput({
        isCreateMode: false,
      });
    const windowKeyDown = vi.fn((event: KeyboardEvent) => {
      event.preventDefault();
    });

    window.addEventListener('keydown', windowKeyDown);

    try {
      const eventAllowed = fireEvent.keyDown(input, {
        key: 'Enter',
        ...modifier,
      });

      expect(eventAllowed).toBe(false);
      expect(windowKeyDown).toHaveBeenCalledTimes(1);
      expect(flushNameUpdate).not.toHaveBeenCalled();
      expect(targetEditorCursorRef.current).toBe(12);

      vi.runOnlyPendingTimers();

      expect(focusEditor).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', windowKeyDown);
    }
  });

  it('submits from compact mode without focusing the description editor', () => {
    const onSubmit = vi.fn();
    const { focusEditor, targetEditorCursorRef, input } = renderTaskNameInput({
      onSubmit,
      variant: 'compact',
    });

    const eventAllowed = fireEvent.keyDown(input, { key: 'Enter' });

    expect(eventAllowed).toBe(false);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(targetEditorCursorRef.current).toBe(12);

    vi.runOnlyPendingTimers();

    expect(focusEditor).not.toHaveBeenCalled();
  });
});
