import { act, renderHook } from '@testing-library/react';
import type { Editor } from '@tiptap/react';
import { describe, expect, it, vi } from 'vitest';
import type { MentionOption } from '../../../mention-system/types';
import type { SlashCommandDefinition } from '../../../slash-commands/definitions';
import {
  type UseTaskDialogKeyboardShortcutsProps,
  useTaskDialogKeyboardShortcuts,
} from '../use-task-dialog-keyboard-shortcuts';

function makeEditorInstance(dom: HTMLElement) {
  return {
    view: {
      dom,
    },
  } as unknown as Editor;
}

function makeSlashCommand(): SlashCommandDefinition {
  return {
    id: 'toggle-advanced',
    label: 'Advanced',
    icon: (() => null) as unknown as SlashCommandDefinition['icon'],
    keywords: ['advanced'],
  };
}

function makeMentionOption(): MentionOption {
  return {
    id: 'user-1',
    label: 'User One',
    type: 'user',
  };
}

function makeProps(
  overrides: Partial<UseTaskDialogKeyboardShortcutsProps> = {}
): UseTaskDialogKeyboardShortcutsProps {
  const editorDom = document.createElement('div');

  return {
    isOpen: true,
    canSave: true,
    isCreateMode: false,
    collaborationMode: true,
    editorInstance: makeEditorInstance(editorDom),
    boardConfig: null,
    slashState: { open: false },
    filteredSlashCommands: [],
    slashHighlightIndex: 0,
    setSlashHighlightIndex: vi.fn(),
    mentionState: { open: false },
    filteredMentionOptions: [],
    mentionHighlightIndex: 0,
    setMentionHighlightIndex: vi.fn(),
    showCustomDatePicker: false,
    setShowCustomDatePicker: vi.fn(),
    setCustomDate: vi.fn(),
    handleSaveRef: { current: vi.fn() },
    handleCloseRef: { current: vi.fn() },
    hasUnsavedChangesRef: { current: true },
    quickDueRef: { current: vi.fn() },
    updateEstimationRef: { current: vi.fn() },
    setPriority: vi.fn(),
    setShowAdvancedOptions: vi.fn(),
    executeSlashCommand: vi.fn(),
    insertMentionOption: vi.fn(),
    closeSlashMenu: vi.fn(),
    closeMentionMenu: vi.fn(),
    ...overrides,
  };
}

function dispatchEditorKeydown(
  editorInstance: Editor | null,
  key: string,
  init: KeyboardEventInit = {}
) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  const dom = editorInstance?.view.dom as HTMLElement;

  act(() => {
    dom.dispatchEvent(event);
  });

  return event;
}

describe('useTaskDialogKeyboardShortcuts', () => {
  it('does not consume plain Enter when no slash or mention item is selectable', () => {
    const props = makeProps({
      slashState: { open: true },
      mentionState: { open: false },
      filteredSlashCommands: [],
    });

    renderHook(() => useTaskDialogKeyboardShortcuts(props));

    const event = dispatchEditorKeydown(props.editorInstance, 'Enter');

    expect(event.defaultPrevented).toBe(false);
    expect(props.executeSlashCommand).not.toHaveBeenCalled();
    expect(props.insertMentionOption).not.toHaveBeenCalled();
  });

  it('executes a highlighted slash command on Enter', () => {
    const command = makeSlashCommand();
    const props = makeProps({
      slashState: { open: true },
      filteredSlashCommands: [command],
    });

    renderHook(() => useTaskDialogKeyboardShortcuts(props));

    const event = dispatchEditorKeydown(props.editorInstance, 'Enter');

    expect(event.defaultPrevented).toBe(true);
    expect(props.executeSlashCommand).toHaveBeenCalledWith(command);
  });

  it('executes a highlighted mention option on Enter', () => {
    const option = makeMentionOption();
    const props = makeProps({
      mentionState: { open: true },
      filteredMentionOptions: [option],
    });

    renderHook(() => useTaskDialogKeyboardShortcuts(props));

    const event = dispatchEditorKeydown(props.editorInstance, 'Enter');

    expect(event.defaultPrevented).toBe(true);
    expect(props.insertMentionOption).toHaveBeenCalledWith(option);
  });
});
