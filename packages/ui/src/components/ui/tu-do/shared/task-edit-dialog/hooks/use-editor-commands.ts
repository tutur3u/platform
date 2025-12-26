import type { Editor } from '@tiptap/react';
import dayjs from 'dayjs';
import { useCallback } from 'react';
import type {
  MentionOption,
  SuggestionState,
} from '../../mention-system/types';
import type { SlashCommandDefinition } from '../../slash-commands/definitions';

/**
 * Payload structure for task mentions inserted via the editor
 */
interface TaskPayload {
  display_number?: number;
  priority?: string;
  list?: {
    color?: string;
  };
  assignees?: Array<{
    id: string;
    display_name?: string;
    avatar_url?: string;
  }>;
}

export interface UseEditorCommandsProps {
  editorInstance: Editor | null;
  slashState: SuggestionState;
  mentionState: SuggestionState;
  includeTime: boolean;
  selectedHour: string;
  selectedMinute: string;
  selectedPeriod: 'AM' | 'PM';
  handleQuickDueDate: (days: number | null) => void;
  setPriority: (value: any) => void;
  setShowAdvancedOptions: (
    value: boolean | ((prev: boolean) => boolean)
  ) => void;
  setShowCustomDatePicker: (value: boolean) => void;
  setCustomDate: (value: Date | undefined) => void;
  setIncludeTime: (value: boolean) => void;
  setSelectedHour: (value: string) => void;
  setSelectedMinute: (value: string) => void;
  setSelectedPeriod: (value: 'AM' | 'PM') => void;
  closeSlashMenu: () => void;
  closeMentionMenu: () => void;
  handleConvertToTaskRef: React.MutableRefObject<(() => void) | null>;
}

export interface UseEditorCommandsReturn {
  executeSlashCommand: (command: SlashCommandDefinition) => void;
  insertMentionOption: (option: MentionOption) => void;
  handleCustomDateSelect: (date: Date | undefined) => void;
}

/**
 * Custom hook for handling editor slash commands and mention insertions
 * Extracted from task-edit-dialog.tsx to improve maintainability
 */
export function useEditorCommands({
  editorInstance,
  slashState,
  mentionState,
  includeTime,
  selectedHour,
  selectedMinute,
  selectedPeriod,
  handleQuickDueDate,
  setPriority,
  setShowAdvancedOptions,
  setShowCustomDatePicker,
  setCustomDate,
  setIncludeTime,
  setSelectedHour,
  setSelectedMinute,
  setSelectedPeriod,
  closeSlashMenu,
  closeMentionMenu,
  handleConvertToTaskRef,
}: UseEditorCommandsProps): UseEditorCommandsReturn {
  const executeSlashCommand = useCallback(
    (command: SlashCommandDefinition) => {
      if (!editorInstance) return;

      const range = slashState.range;
      const baseChain = editorInstance.chain().focus();
      if (range) {
        baseChain.deleteRange(range);
      }
      baseChain.run();

      closeSlashMenu();

      switch (command.id) {
        case 'assign':
          editorInstance.chain().focus().insertContent('@').run();
          return;
        case 'due-today':
          handleQuickDueDate(0);
          return;
        case 'due-tomorrow':
          handleQuickDueDate(1);
          return;
        case 'due-next-week':
          handleQuickDueDate(7);
          return;
        case 'clear-due':
          handleQuickDueDate(null);
          return;
        case 'priority-critical':
          setPriority('critical');
          return;
        case 'priority-high':
          setPriority('high');
          return;
        case 'priority-normal':
          setPriority('normal');
          return;
        case 'priority-low':
          setPriority('low');
          return;
        case 'priority-clear':
          setPriority(null);
          return;
        case 'toggle-advanced':
          setShowAdvancedOptions((prev) => !prev);
          return;
        case 'convert-to-task':
          setTimeout(() => {
            handleConvertToTaskRef.current?.();
          }, 0);
          return;
        default:
          return;
      }
    },
    [
      editorInstance,
      slashState.range,
      closeSlashMenu,
      handleQuickDueDate,
      setPriority,
      setShowAdvancedOptions,
      handleConvertToTaskRef,
    ]
  );

  const insertMentionOption = useCallback(
    (option: MentionOption) => {
      if (!editorInstance) return;

      if (option.id === 'custom-date') {
        setShowCustomDatePicker(true);
        return;
      }

      const chain = editorInstance.chain().focus();
      if (mentionState.range) {
        chain.deleteRange(mentionState.range);
      }

      const attributes: Record<string, any> = {
        userId: option.type === 'user' ? option.id : null,
        entityId: option.id,
        entityType: option.type,
        displayName: option.label,
        avatarUrl: option.avatarUrl ?? null,
        subtitle: option.subtitle ?? null,
      };

      // For tasks, we want to use the display number as the display name
      // and populate additional attributes for the chip
      if (option.type === 'task' && option.payload) {
        const task = option.payload as TaskPayload;
        if (task.display_number) {
          attributes.displayName = String(task.display_number);
        }
        // Set subtitle to task name (option.label) for consistent chip display
        attributes.subtitle = option.label;
        if (task.priority) {
          attributes.priority = task.priority;
        }
        if (task.list?.color) {
          attributes.listColor = task.list.color;
        }
        if (task.assignees) {
          attributes.assignees = JSON.stringify(task.assignees);
        }
      }

      chain
        .insertContent([
          {
            type: 'mention',
            attrs: attributes,
          },
          { type: 'text', text: ' ' },
        ])
        .run();

      closeMentionMenu();
    },
    [
      editorInstance,
      mentionState.range,
      closeMentionMenu,
      setShowCustomDatePicker,
    ]
  );

  const handleCustomDateSelect = useCallback(
    (date: Date | undefined) => {
      if (!editorInstance || !date) return;

      let finalDate = dayjs(date);
      let formattedDate = finalDate.format('MMM D, YYYY');

      if (includeTime) {
        const hourVal = parseInt(selectedHour || '12', 10);
        const minuteVal = parseInt(selectedMinute || '0', 10);

        let hour = hourVal;
        if (selectedPeriod === 'PM' && hour !== 12) {
          hour += 12;
        } else if (selectedPeriod === 'AM' && hour === 12) {
          hour = 0;
        }

        finalDate = finalDate
          .hour(hour)
          .minute(minuteVal)
          .second(0)
          .millisecond(0);
        formattedDate = finalDate.format('MMM D, YYYY h:mm A');
      }

      const chain = editorInstance.chain().focus();

      if (mentionState.range) {
        chain.deleteRange(mentionState.range);
      }

      chain
        .insertContent([
          {
            type: 'mention',
            attrs: {
              userId: null,
              entityId: `custom-${finalDate.toISOString()}`,
              entityType: 'date',
              displayName: formattedDate,
              avatarUrl: null,
              subtitle: null,
            },
          },
          { type: 'text', text: ' ' },
        ])
        .run();

      setShowCustomDatePicker(false);
      setCustomDate(undefined);
      setIncludeTime(false);
      setSelectedHour('12');
      setSelectedMinute('00');
      setSelectedPeriod('PM');
      closeMentionMenu();
    },
    [
      editorInstance,
      mentionState.range,
      closeMentionMenu,
      includeTime,
      selectedHour,
      selectedMinute,
      selectedPeriod,
      setShowCustomDatePicker,
      setCustomDate,
      setIncludeTime,
      setSelectedHour,
      setSelectedMinute,
      setSelectedPeriod,
    ]
  );

  return {
    executeSlashCommand,
    insertMentionOption,
    handleCustomDateSelect,
  };
}
