import { Input } from '@tuturuuu/ui/input';
import { MAX_TASK_NAME_LENGTH } from '@tuturuuu/utils/constants';
import { useTranslations } from 'next-intl';
import {
  getNormalizedCursorPosition,
  normalizeLiveTextReplacements,
  normalizeTextReplacements,
} from '../../../../text-editor/text-replacements';

interface TaskNameInputProps {
  name: string;
  isCreateMode: boolean;
  titleInputRef: React.RefObject<HTMLInputElement | null>;
  editorRef: React.RefObject<HTMLDivElement | null>;
  lastCursorPositionRef: React.RefObject<number | null>;
  targetEditorCursorRef: React.MutableRefObject<number | null>;
  setName: (value: string) => void;
  updateName: (value: string) => void;
  flushNameUpdate: () => void;
  disabled?: boolean;
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
}: TaskNameInputProps) {
  const t = useTranslations('ws-task-boards.dialog');

  return (
    <div className="group">
      <Input
        ref={titleInputRef}
        data-task-name-input
        disabled={disabled}
        value={name}
        maxLength={MAX_TASK_NAME_LENGTH}
        onChange={(e) => {
          const rawValue = e.target.value;
          const normalizedValue = normalizeLiveTextReplacements(rawValue);

          if (rawValue !== normalizedValue) {
            const rawCursorPosition =
              e.target.selectionStart ?? rawValue.length;
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
        }}
        onBlur={(e) => {
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
        }}
        onKeyDown={(e) => {
          // Enter key moves to description
          if (e.key === 'Enter') {
            e.preventDefault();
            // Flush pending save immediately when pressing Enter (in edit mode)
            if (!isCreateMode && e.currentTarget.value.trim()) {
              flushNameUpdate();
            }
            const editorElement = editorRef.current?.querySelector(
              '.ProseMirror'
            ) as HTMLElement;
            if (editorElement) {
              editorElement.focus();
              // Clear the target cursor so it goes to the start
              targetEditorCursorRef.current = null;
            }
          }

          if (e.key === 'ArrowDown') {
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
          if (e.key === 'ArrowRight') {
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
        }}
        placeholder={t('task_name_placeholder')}
        className="h-auto border-0 bg-transparent px-4 pt-4 pb-2 font-bold text-2xl text-foreground leading-tight tracking-tight shadow-none transition-colors placeholder:text-muted-foreground/30 focus-visible:outline-0 focus-visible:ring-0 disabled:opacity-100 md:px-8 md:pt-4 md:pb-2 md:text-2xl"
        autoFocus
      />
    </div>
  );
}
