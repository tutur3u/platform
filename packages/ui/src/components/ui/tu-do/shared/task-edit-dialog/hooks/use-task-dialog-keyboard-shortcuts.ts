'use client';

import type { Editor } from '@tiptap/react';
import { useEffect } from 'react';
import type { MentionOption } from '../../mention-system/types';
import type { SlashCommandDefinition } from '../../slash-commands/definitions';

export interface UseTaskDialogKeyboardShortcutsProps {
  isOpen: boolean;
  canSave: boolean;
  isCreateMode: boolean;
  collaborationMode: boolean;
  editorInstance: Editor | null;
  boardConfig: { estimation_type?: string | null } | null | undefined;

  // Slash menu state
  slashState: { open: boolean };
  filteredSlashCommands: SlashCommandDefinition[];
  slashHighlightIndex: number;
  setSlashHighlightIndex: React.Dispatch<React.SetStateAction<number>>;

  // Mention menu state
  mentionState: { open: boolean };
  filteredMentionOptions: MentionOption[];
  mentionHighlightIndex: number;
  setMentionHighlightIndex: React.Dispatch<React.SetStateAction<number>>;

  // Custom date picker
  showCustomDatePicker: boolean;
  setShowCustomDatePicker: React.Dispatch<React.SetStateAction<boolean>>;
  setCustomDate: React.Dispatch<React.SetStateAction<Date | undefined>>;

  // Refs for handlers
  handleSaveRef: React.MutableRefObject<() => void>;
  handleCloseRef: React.MutableRefObject<() => void>;
  hasUnsavedChangesRef: React.MutableRefObject<boolean>;
  quickDueRef: React.MutableRefObject<(days: number | null) => void>;
  updateEstimationRef: React.MutableRefObject<(points: number | null) => void>;

  // State setters
  setPriority: React.Dispatch<
    React.SetStateAction<'critical' | 'high' | 'low' | 'normal' | null>
  >;
  setShowAdvancedOptions: React.Dispatch<React.SetStateAction<boolean>>;

  // Menu actions
  executeSlashCommand: (command: SlashCommandDefinition) => void;
  insertMentionOption: (option: MentionOption) => void;
  closeSlashMenu: () => void;
  closeMentionMenu: () => void;
}

export function useTaskDialogKeyboardShortcuts({
  isOpen,
  canSave,
  isCreateMode,
  collaborationMode,
  editorInstance,
  boardConfig,
  slashState,
  filteredSlashCommands,
  slashHighlightIndex,
  setSlashHighlightIndex,
  mentionState,
  filteredMentionOptions,
  mentionHighlightIndex,
  setMentionHighlightIndex,
  showCustomDatePicker,
  setShowCustomDatePicker,
  setCustomDate,
  handleSaveRef,
  handleCloseRef,
  hasUnsavedChangesRef,
  quickDueRef,
  updateEstimationRef,
  setPriority,
  setShowAdvancedOptions,
  executeSlashCommand,
  insertMentionOption,
  closeSlashMenu,
  closeMentionMenu,
}: UseTaskDialogKeyboardShortcutsProps): void {
  // Global keyboard shortcut: Cmd/Ctrl + Enter to save
  // Disabled in edit mode when collaboration is enabled (realtime sync)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        // Don't allow save shortcut in edit mode with collaboration (realtime sync)
        if (!isCreateMode && collaborationMode) {
          return;
        }
        if (canSave) {
          handleSaveRef.current();
        } else if (!hasUnsavedChangesRef.current) {
          handleCloseRef.current();
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isOpen,
    canSave,
    collaborationMode,
    isCreateMode,
    handleSaveRef,
    handleCloseRef,
    hasUnsavedChangesRef,
  ]);

  // Keyboard shortcuts for options (Alt-based)
  useEffect(() => {
    if (!isOpen) return;

    const isTypingTarget = (target: EventTarget | null): boolean => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName?.toLowerCase();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const editable = (el as any).isContentEditable === true;
      return (
        editable || tag === 'input' || tag === 'textarea' || tag === 'select'
      );
    };

    const handleOptionShortcuts = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      if (isTypingTarget(e.target)) return;

      // Priority shortcuts (Alt + 1-4, 0)
      if (e.key === '1') {
        e.preventDefault();
        setPriority('critical');
        return;
      }
      if (e.key === '2') {
        e.preventDefault();
        setPriority('high');
        return;
      }
      if (e.key === '3') {
        e.preventDefault();
        setPriority('normal');
        return;
      }
      if (e.key === '4') {
        e.preventDefault();
        setPriority('low');
        return;
      }
      if (e.key === '0') {
        e.preventDefault();
        setPriority(null);
        return;
      }

      const lower = e.key.toLowerCase();

      // Due date shortcuts
      if (lower === 't') {
        e.preventDefault();
        quickDueRef.current(0); // Today
        return;
      }
      if (lower === 'm') {
        e.preventDefault();
        quickDueRef.current(1); // Tomorrow
        return;
      }
      if (lower === 'w') {
        e.preventDefault();
        quickDueRef.current(7); // Next week
        return;
      }
      if (lower === 'd') {
        e.preventDefault();
        quickDueRef.current(null); // Clear due date
        return;
      }

      // Toggle advanced options
      if (lower === 'a') {
        e.preventDefault();
        setShowAdvancedOptions((prev) => !prev);
        return;
      }

      // Estimation shortcuts (Alt + Shift + 0-7, X)
      if (e.shiftKey && boardConfig?.estimation_type) {
        if (/^[0-7]$/.test(e.key)) {
          e.preventDefault();
          const idx = Number(e.key);
          updateEstimationRef.current(idx);
          return;
        }
        if (lower === 'x') {
          e.preventDefault();
          updateEstimationRef.current(null);
          return;
        }
      }
    };

    window.addEventListener('keydown', handleOptionShortcuts);
    return () => window.removeEventListener('keydown', handleOptionShortcuts);
  }, [
    isOpen,
    boardConfig?.estimation_type,
    setPriority,
    setShowAdvancedOptions,
    quickDueRef,
    updateEstimationRef,
  ]);

  // Editor keyboard navigation for slash and mention menus
  useEffect(() => {
    if (!editorInstance || !isOpen) return;

    const editorDom = editorInstance.view.dom as HTMLElement | null;
    if (!editorDom) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Escape to close custom date picker
      if (showCustomDatePicker && event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setShowCustomDatePicker(false);
        setCustomDate(undefined);
        return;
      }

      // Escape to close slash/mention menus
      if ((slashState.open || mentionState.open) && event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeSlashMenu();
        closeMentionMenu();
        return;
      }

      // Slash command navigation
      if (slashState.open) {
        if (filteredSlashCommands.length === 0) return;

        if (
          event.key === 'ArrowDown' ||
          (event.key === 'Tab' && !event.shiftKey)
        ) {
          event.preventDefault();
          event.stopPropagation();
          setSlashHighlightIndex(
            (prev) => (prev + 1) % filteredSlashCommands.length
          );
          return;
        }

        if (
          event.key === 'ArrowUp' ||
          (event.key === 'Tab' && event.shiftKey)
        ) {
          event.preventDefault();
          event.stopPropagation();
          setSlashHighlightIndex(
            (prev) =>
              (prev - 1 + filteredSlashCommands.length) %
              filteredSlashCommands.length
          );
          return;
        }

        if (event.key === 'Enter') {
          event.preventDefault();
          event.stopPropagation();
          const command = filteredSlashCommands[slashHighlightIndex];
          if (command) executeSlashCommand(command);
          return;
        }
      }

      // Mention navigation
      if (mentionState.open && !showCustomDatePicker) {
        if (filteredMentionOptions.length === 0) return;

        if (
          event.key === 'ArrowDown' ||
          (event.key === 'Tab' && !event.shiftKey)
        ) {
          event.preventDefault();
          event.stopPropagation();
          setMentionHighlightIndex(
            (prev) => (prev + 1) % filteredMentionOptions.length
          );
          return;
        }

        if (
          event.key === 'ArrowUp' ||
          (event.key === 'Tab' && event.shiftKey)
        ) {
          event.preventDefault();
          event.stopPropagation();
          setMentionHighlightIndex(
            (prev) =>
              (prev - 1 + filteredMentionOptions.length) %
              filteredMentionOptions.length
          );
          return;
        }

        if (event.key === 'Enter') {
          event.preventDefault();
          event.stopPropagation();
          const option = filteredMentionOptions[mentionHighlightIndex];
          if (option) insertMentionOption(option);
          return;
        }
      }
    };

    editorDom.addEventListener('keydown', handleKeyDown, true);
    return () => {
      editorDom.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [
    editorInstance,
    isOpen,
    slashState.open,
    mentionState.open,
    filteredSlashCommands,
    filteredMentionOptions,
    slashHighlightIndex,
    mentionHighlightIndex,
    executeSlashCommand,
    insertMentionOption,
    closeSlashMenu,
    closeMentionMenu,
    showCustomDatePicker,
    setSlashHighlightIndex,
    setMentionHighlightIndex,
    setShowCustomDatePicker,
    setCustomDate,
  ]);
}
