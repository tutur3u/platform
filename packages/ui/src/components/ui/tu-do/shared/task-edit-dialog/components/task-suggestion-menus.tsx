'use client';

import { createPortal } from 'react-dom';
import { CustomDatePickerDialog } from '../../custom-date-picker/custom-date-picker-dialog';
import { MentionMenu } from '../../mention-system/mention-menu';
import type {
  MentionOption,
  SuggestionState,
} from '../../mention-system/types';
import type { SlashCommandDefinition } from '../../slash-commands/definitions';
import { SlashCommandMenu } from '../../slash-commands/slash-command-menu';

export interface TaskSuggestionMenusProps {
  // Slash command state
  slashState: SuggestionState;
  filteredSlashCommands: SlashCommandDefinition[];
  slashHighlightIndex: number;
  setSlashHighlightIndex: React.Dispatch<React.SetStateAction<number>>;
  slashListRef: React.RefObject<HTMLDivElement | null>;

  // Mention state
  mentionState: SuggestionState;
  filteredMentionOptions: MentionOption[];
  mentionHighlightIndex: number;
  setMentionHighlightIndex: React.Dispatch<React.SetStateAction<number>>;
  mentionListRef: React.RefObject<HTMLDivElement | null>;
  workspaceTasksLoading: boolean;

  // Custom date picker state
  showCustomDatePicker: boolean;
  setShowCustomDatePicker: React.Dispatch<React.SetStateAction<boolean>>;
  customDate: Date | undefined;
  setCustomDate: React.Dispatch<React.SetStateAction<Date | undefined>>;
  includeTime: boolean;
  setIncludeTime: React.Dispatch<React.SetStateAction<boolean>>;
  selectedHour: string;
  setSelectedHour: React.Dispatch<React.SetStateAction<string>>;
  selectedMinute: string;
  setSelectedMinute: React.Dispatch<React.SetStateAction<string>>;
  selectedPeriod: 'AM' | 'PM';
  setSelectedPeriod: React.Dispatch<React.SetStateAction<'AM' | 'PM'>>;

  // Callbacks
  executeSlashCommand: (command: SlashCommandDefinition) => void;
  insertMentionOption: (option: MentionOption) => void;
  handleCustomDateSelect: (date: Date) => void;
}

/**
 * Component that renders the slash command menu, mention menu, and custom date picker.
 * These are portaled to document.body to avoid z-index issues.
 */
export function TaskSuggestionMenus({
  slashState,
  filteredSlashCommands,
  slashHighlightIndex,
  setSlashHighlightIndex,
  slashListRef,
  mentionState,
  filteredMentionOptions,
  mentionHighlightIndex,
  setMentionHighlightIndex,
  mentionListRef,
  workspaceTasksLoading,
  showCustomDatePicker,
  setShowCustomDatePicker,
  customDate,
  setCustomDate,
  includeTime,
  setIncludeTime,
  selectedHour,
  setSelectedHour,
  selectedMinute,
  setSelectedMinute,
  selectedPeriod,
  setSelectedPeriod,
  executeSlashCommand,
  insertMentionOption,
  handleCustomDateSelect,
}: TaskSuggestionMenusProps) {
  return (
    <>
      <SlashCommandMenu
        isOpen={slashState.open}
        position={slashState.position}
        commands={filteredSlashCommands}
        highlightIndex={slashHighlightIndex}
        onSelect={executeSlashCommand}
        onHighlightChange={setSlashHighlightIndex}
        listRef={slashListRef}
      />

      <MentionMenu
        isOpen={mentionState.open}
        position={mentionState.position}
        options={filteredMentionOptions}
        highlightIndex={mentionHighlightIndex}
        isLoading={workspaceTasksLoading}
        query={mentionState.query}
        onSelect={insertMentionOption}
        onHighlightChange={setMentionHighlightIndex}
        listRef={mentionListRef}
      />

      {showCustomDatePicker &&
        mentionState.position &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="pointer-events-auto"
            style={{
              position: 'fixed',
              top: mentionState.position.top,
              left: mentionState.position.left,
              zIndex: 9999,
            }}
          >
            <CustomDatePickerDialog
              selectedDate={customDate}
              includeTime={includeTime}
              selectedHour={selectedHour}
              selectedMinute={selectedMinute}
              selectedPeriod={selectedPeriod}
              onDateSelect={setCustomDate}
              onIncludeTimeChange={setIncludeTime}
              onHourChange={setSelectedHour}
              onMinuteChange={setSelectedMinute}
              onPeriodChange={setSelectedPeriod}
              onCancel={() => {
                setShowCustomDatePicker(false);
                setCustomDate(undefined);
                setIncludeTime(false);
                setSelectedHour('12');
                setSelectedMinute('00');
                setSelectedPeriod('PM');
              }}
              onInsert={() => {
                if (customDate) {
                  handleCustomDateSelect(customDate);
                }
              }}
            />
          </div>,
          document.body
        )}
    </>
  );
}
