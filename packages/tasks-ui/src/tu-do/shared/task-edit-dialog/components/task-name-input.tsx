import { Input } from '@tuturuuu/ui/input';
import {
  getNormalizedCursorPosition,
  normalizeLiveTextReplacements,
  normalizeTextReplacements,
} from '@tuturuuu/ui/text-editor/text-replacements';
import { Textarea } from '@tuturuuu/ui/textarea';
import { MAX_TASK_NAME_LENGTH } from '@tuturuuu/utils/constants';
import { useTranslations } from 'next-intl';
import { useLayoutEffect, useRef } from 'react';

type TaskTitleControlElement = HTMLInputElement | HTMLTextAreaElement;

interface TaskNameInputProps {
  name: string;
  isCreateMode: boolean;
  titleInputRef: React.RefObject<TaskTitleControlElement | null>;
  editorRef: React.RefObject<HTMLDivElement | null>;
  lastCursorPositionRef: React.RefObject<number | null>;
  targetEditorCursorRef: React.MutableRefObject<number | null>;
  setName: (value: string) => void;
  updateName: (value: string) => void;
  flushNameUpdate: () => void;
  disabled?: boolean;
  variant?: 'fullscreen' | 'compact';
  onSubmit?: () => void;
}

export function TaskNameInput({
  name,
  isCreateMode,
  titleInputRef,
  editorRef,
  lastCursorPositionRef,
  targetEditorCursorRef,
  setName,
  updateName,
  flushNameUpdate,
  disabled,
  variant = 'fullscreen',
  onSubmit,
}: TaskNameInputProps) {
  const t = useTranslations('ws-task-boards.dialog');
  const isCompact = variant === 'compact';
  const hasPlacedInitialCaretRef = useRef(false);

  useLayoutEffect(() => {
    if (hasPlacedInitialCaretRef.current || disabled) return;

    const titleInput = titleInputRef.current;
    if (!titleInput) return;

    hasPlacedInitialCaretRef.current = true;
    const endPosition = titleInput.value.length;

    titleInput.focus();
    titleInput.setSelectionRange(endPosition, endPosition);
  }, [disabled, titleInputRef]);

  const focusDescriptionEditor = () => {
    if (isCompact) return;

    targetEditorCursorRef.current = null;

    setTimeout(() => {
      const editorElement = editorRef.current?.querySelector(
        '.ProseMirror'
      ) as HTMLElement | null;

      editorElement?.focus();
    }, 0);
  };

  const handleChange = (e: React.ChangeEvent<TaskTitleControlElement>) => {
    const rawValue = e.target.value;
    const normalizedValue = normalizeLiveTextReplacements(rawValue);

    if (rawValue !== normalizedValue) {
      const rawCursorPosition = e.target.selectionStart ?? rawValue.length;
      const nextCursorPosition = getNormalizedCursorPosition(
        rawValue,
        rawCursorPosition,
        normalizeLiveTextReplacements
      );

      requestAnimationFrame(() => {
        titleInputRef.current?.setSelectionRange(
          nextCursorPosition,
          nextCursorPosition
        );
      });
    }

    setName(normalizedValue);
    // Trigger debounced save while typing (in edit mode)
    if (!isCreateMode && normalizedValue.trim()) {
      updateName(normalizedValue);
    }
  };

  const handleBlur = (e: React.FocusEvent<TaskTitleControlElement>) => {
    const normalizedValue = normalizeTextReplacements(e.target.value);

    if (normalizedValue !== e.target.value) {
      setName(normalizedValue);
      if (!isCreateMode && normalizedValue.trim()) {
        updateName(normalizedValue);
      }
    }

    // Flush pending save immediately when user clicks away (in edit mode)
    if (!isCreateMode && normalizedValue.trim()) {
      flushNameUpdate();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<TaskTitleControlElement>) => {
    // Enter key moves to description
    if (
      e.key === 'Enter' &&
      !e.altKey &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.shiftKey
    ) {
      if (e.nativeEvent.isComposing || e.keyCode === 229) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      // Flush pending save immediately when pressing Enter (in edit mode)
      if (!isCreateMode && e.currentTarget.value.trim()) {
        flushNameUpdate();
      }
      if (isCompact) {
        onSubmit?.();
        return;
      }
      focusDescriptionEditor();
    }

    if (!isCompact && e.key === 'ArrowDown') {
      e.preventDefault();
      const input = e.currentTarget;
      const cursorPosition = input.selectionStart ?? 0;

      // Store cursor position for smart navigation
      lastCursorPositionRef.current = cursorPosition;
      targetEditorCursorRef.current = cursorPosition;

      // Focus the editor - cursor positioning will be handled by the editor via prop
      const editorElement = editorRef.current?.querySelector(
        '.ProseMirror'
      ) as HTMLElement;
      if (editorElement) {
        editorElement.focus();
      }
    }

    // Right arrow at end of title moves to description
    if (!isCompact && e.key === 'ArrowRight') {
      const input = e.currentTarget;
      const cursorPosition = input.selectionStart ?? 0;
      const textLength = input.value.length;

      // Only move if cursor is at the end
      if (cursorPosition === textLength) {
        e.preventDefault();
        const editorElement = editorRef.current?.querySelector(
          '.ProseMirror'
        ) as HTMLElement;
        if (editorElement) {
          editorElement.focus();
        }
      }
    }
  };

  if (isCompact) {
    return (
      <div className="group">
        <Textarea
          ref={titleInputRef as React.RefObject<HTMLTextAreaElement | null>}
          data-task-name-input
          disabled={disabled}
          value={name}
          maxLength={MAX_TASK_NAME_LENGTH}
          rows={1}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={t('task_name_placeholder')}
          className="max-h-32 min-h-11 resize-none overflow-y-auto border-0 bg-transparent px-0 py-0 font-semibold text-base text-foreground leading-tight shadow-none transition-colors placeholder:text-muted-foreground/40 focus-visible:outline-0 focus-visible:ring-0 disabled:opacity-100 md:text-lg"
          autoFocus
        />
      </div>
    );
  }

  return (
    <div className="group">
      <Input
        ref={titleInputRef as React.RefObject<HTMLInputElement | null>}
        data-task-name-input
        disabled={disabled}
        value={name}
        maxLength={MAX_TASK_NAME_LENGTH}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={t('task_name_placeholder')}
        className="h-auto border-0 bg-transparent px-4 pt-4 pb-2 font-bold text-2xl text-foreground leading-tight tracking-tight shadow-none transition-colors placeholder:text-muted-foreground/30 focus-visible:outline-0 focus-visible:ring-0 disabled:opacity-100 md:px-8 md:pt-4 md:pb-2 md:text-2xl"
        autoFocus
      />
    </div>
  );
}
