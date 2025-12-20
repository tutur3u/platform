'use client';

import type { Editor } from '@tiptap/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MentionOption } from '../../mention-system/types';
import {
  createInitialSuggestionState,
  isSameSuggestionState,
  type SuggestionState,
} from '../../mention-system/types';
import { useMentionSuggestions } from '../../mention-system/use-mention-suggestions';
import {
  filterSlashCommands,
  getSlashCommands,
  type SlashCommandDefinition,
} from '../../slash-commands/definitions';
import { SUGGESTION_MENU_WIDTH } from '../constants';

export interface UseSuggestionMenusProps {
  editorInstance: Editor | null;
  isOpen: boolean;
  workspaceMembers: Array<{
    id: string;
    user_id: string | null;
    display_name?: string | null;
    avatar_url?: string | null;
  }>;
  boardConfig:
    | {
        id: string;
        name?: string;
        estimation_type?: string | null;
      }
    | null
    | undefined;
  taskProjects: Array<{ id: string; name: string }>;
  workspaceTasks: Array<{
    id: string;
    name: string;
    display_number?: number | null;
  }>;
  workspaceTasksLoading: boolean;
  wsId: string;
  currentTaskId?: string;
  isPersonalWorkspace: boolean;
  endDate?: Date;
  priority: string | null;
  showAdvancedOptions: boolean;
  setShowAdvancedOptions: React.Dispatch<React.SetStateAction<boolean>>;
}

export interface UseSuggestionMenusReturn {
  // Slash command state
  slashState: SuggestionState;
  setSlashState: React.Dispatch<React.SetStateAction<SuggestionState>>;
  slashHighlightIndex: number;
  setSlashHighlightIndex: React.Dispatch<React.SetStateAction<number>>;
  filteredSlashCommands: SlashCommandDefinition[];
  slashListRef: React.RefObject<HTMLDivElement | null>;
  closeSlashMenu: () => void;

  // Mention state
  mentionState: SuggestionState;
  setMentionState: React.Dispatch<React.SetStateAction<SuggestionState>>;
  mentionHighlightIndex: number;
  setMentionHighlightIndex: React.Dispatch<React.SetStateAction<number>>;
  filteredMentionOptions: MentionOption[];
  mentionListRef: React.RefObject<HTMLDivElement | null>;
  closeMentionMenu: () => void;

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
}

export function useSuggestionMenus({
  editorInstance,
  isOpen,
  workspaceMembers,
  boardConfig,
  taskProjects,
  workspaceTasks,
  wsId,
  currentTaskId,
  isPersonalWorkspace,
  endDate,
  priority,
  showAdvancedOptions,
}: UseSuggestionMenusProps): UseSuggestionMenusReturn {
  // Slash command state
  const [slashState, setSlashState] = useState<SuggestionState>(
    createInitialSuggestionState
  );
  const [slashHighlightIndex, setSlashHighlightIndex] = useState(0);
  const slashListRef = useRef<HTMLDivElement>(null);
  const previousSlashHighlightRef = useRef(0);
  const previousSlashQueryRef = useRef('');

  // Mention state
  const [mentionState, setMentionState] = useState<SuggestionState>(
    createInitialSuggestionState
  );
  const [mentionHighlightIndex, setMentionHighlightIndex] = useState(0);
  const mentionListRef = useRef<HTMLDivElement>(null);
  const previousMentionHighlightRef = useRef(0);
  const previousMentionQueryRef = useRef('');

  // Custom date picker state
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);
  const [customDate, setCustomDate] = useState<Date | undefined>(undefined);
  const [includeTime, setIncludeTime] = useState(false);
  const [selectedHour, setSelectedHour] = useState<string>('11');
  const [selectedMinute, setSelectedMinute] = useState<string>('59');
  const [selectedPeriod, setSelectedPeriod] = useState<'AM' | 'PM'>('PM');

  const suggestionMenuWidth = SUGGESTION_MENU_WIDTH;

  // Generate slash commands
  const slashCommands = useMemo<SlashCommandDefinition[]>(() => {
    return getSlashCommands({
      hasMembers: workspaceMembers.length > 0,
      hasEndDate: !!endDate,
      hasPriority: !!priority,
      showAdvanced: showAdvancedOptions,
    });
  }, [workspaceMembers.length, endDate, priority, showAdvancedOptions]);

  // Filter slash commands based on query
  const filteredSlashCommands = useMemo(() => {
    if (!slashState.open) return [] as SlashCommandDefinition[];
    return filterSlashCommands(slashCommands, slashState.query);
  }, [slashCommands, slashState.open, slashState.query]);

  // Get mention suggestions
  const { filteredMentionOptions } = useMentionSuggestions({
    workspaceMembers,
    currentWorkspace: boardConfig
      ? {
          id: wsId,
          name: boardConfig.name || 'Workspace',
          handle: null,
          personal: isPersonalWorkspace,
        }
      : null,
    taskProjects,
    workspaceTasks,
    currentTaskId,
    query: mentionState.query,
  });

  // Close handlers
  const closeSlashMenu = useCallback(() => {
    setSlashState((prev) =>
      prev.open ? createInitialSuggestionState() : prev
    );
  }, []);

  const closeMentionMenu = useCallback(() => {
    setMentionState((prev) =>
      prev.open ? createInitialSuggestionState() : prev
    );
    setShowCustomDatePicker(false);
    setCustomDate(undefined);
    setIncludeTime(false);
    setSelectedHour('11');
    setSelectedMinute('59');
    setSelectedPeriod('PM');
  }, []);

  // Manage slash command highlight index
  useEffect(() => {
    if (!slashState.open) {
      setSlashHighlightIndex(0);
      previousSlashQueryRef.current = '';
      return;
    }

    if (previousSlashQueryRef.current !== slashState.query) {
      previousSlashQueryRef.current = slashState.query;
      setSlashHighlightIndex(0);
      return;
    }

    setSlashHighlightIndex((prev) => {
      if (filteredSlashCommands.length === 0) return 0;
      return Math.min(prev, filteredSlashCommands.length - 1);
    });
  }, [slashState.open, slashState.query, filteredSlashCommands.length]);

  // Scroll slash command menu item into view
  useEffect(() => {
    if (!slashState.open) return;

    if (previousSlashHighlightRef.current === slashHighlightIndex) return;
    previousSlashHighlightRef.current = slashHighlightIndex;

    const timeoutId = setTimeout(() => {
      const container = slashListRef.current;
      if (!container) return;

      const activeItem = container.querySelector<HTMLElement>(
        `[data-slash-item="${slashHighlightIndex}"]`
      );
      if (!activeItem) return;

      const containerRect = container.getBoundingClientRect();
      const itemRect = activeItem.getBoundingClientRect();

      const isVisible =
        itemRect.top >= containerRect.top &&
        itemRect.bottom <= containerRect.bottom;

      if (!isVisible) {
        activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }, 10);

    return () => clearTimeout(timeoutId);
  }, [slashHighlightIndex, slashState.open]);

  // Manage mention highlight index
  useEffect(() => {
    if (!mentionState.open) {
      setMentionHighlightIndex(0);
      previousMentionQueryRef.current = '';
      return;
    }

    if (previousMentionQueryRef.current !== mentionState.query) {
      previousMentionQueryRef.current = mentionState.query;
      setMentionHighlightIndex(0);
      return;
    }

    setMentionHighlightIndex((prev) => {
      if (filteredMentionOptions.length === 0) return 0;
      return Math.min(prev, filteredMentionOptions.length - 1);
    });
  }, [mentionState.open, mentionState.query, filteredMentionOptions.length]);

  // Scroll mention menu item into view
  useEffect(() => {
    if (!mentionState.open) return;

    if (previousMentionHighlightRef.current === mentionHighlightIndex) return;
    previousMentionHighlightRef.current = mentionHighlightIndex;

    const timeoutId = setTimeout(() => {
      const container = mentionListRef.current;
      if (!container) return;

      const activeItem = container.querySelector<HTMLElement>(
        `[data-mention-item="${mentionHighlightIndex}"]`
      );
      if (!activeItem) return;

      const containerRect = container.getBoundingClientRect();
      const itemRect = activeItem.getBoundingClientRect();

      const isVisible =
        itemRect.top >= containerRect.top &&
        itemRect.bottom <= containerRect.bottom;

      if (!isVisible) {
        activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }, 10);

    return () => clearTimeout(timeoutId);
  }, [mentionHighlightIndex, mentionState.open]);

  // Update slash and mention suggestions based on editor state
  useEffect(() => {
    if (!editorInstance || !isOpen) {
      closeSlashMenu();
      closeMentionMenu();
      return;
    }

    const computePosition = (fromPos: number) => {
      try {
        const coords = editorInstance.view.coordsAtPos(fromPos);
        if (!coords) return null;
        const viewportWidth =
          typeof window !== 'undefined' ? window.innerWidth : undefined;
        const viewportHeight =
          typeof window !== 'undefined' ? window.innerHeight : undefined;
        const horizontalPadding = 16;
        const mentionMenuHeight = 360; // header ~40px + max-h-80 (320px)
        const verticalGap = 8;
        const verticalPadding = 8;

        let left = coords.left;
        if (viewportWidth) {
          left = Math.min(
            left,
            viewportWidth - suggestionMenuWidth - horizontalPadding
          );
          left = Math.max(left, horizontalPadding);
        }

        // Calculate vertical position with automatic flip when near bottom
        let top = coords.bottom + verticalGap;
        let flipped = false;

        if (viewportHeight) {
          const spaceBelow = viewportHeight - coords.bottom;
          const spaceAbove = coords.top;

          // Determine menu height based on context (slash vs mention)
          // Both need similar space, so use mention menu height as it's larger
          const menuHeight = mentionMenuHeight;

          // If not enough space below and more space above, position above the text
          if (
            spaceBelow < menuHeight + verticalGap &&
            spaceAbove > menuHeight + verticalGap
          ) {
            top = coords.top - menuHeight - verticalGap;
            flipped = true;
          }

          // Clamp top to ensure menu stays within viewport bounds
          // Apply conditional clamping based on flip direction
          if (flipped) {
            // When flipped above, ensure menu doesn't go above viewport
            top = Math.max(verticalPadding, top);
          } else {
            // When placed below, ensure menu doesn't overflow bottom edge
            top = Math.min(top, viewportHeight - menuHeight - verticalPadding);
          }
        }

        return { left, top } as SuggestionState['position'];
      } catch {
        return null;
      }
    };

    const updateSuggestions = () => {
      const { state } = editorInstance;
      const { selection } = state;

      if (!selection.empty) {
        closeSlashMenu();
        if (!showCustomDatePicker) {
          closeMentionMenu();
        }
        return;
      }

      const { from } = selection;
      const contextText = state.doc.textBetween(
        Math.max(0, from - 200),
        from,
        '\n',
        ' '
      );

      const slashMatch = contextText.match(/(?:^|\s)(\/([^\s]*))$/);
      if (slashMatch) {
        const matched = slashMatch[1] || '';
        const query = slashMatch[2] || '';
        const rangeFrom = from - matched.length;
        const nextState: SuggestionState = {
          open: true,
          query,
          range: { from: rangeFrom, to: from },
          position: computePosition(rangeFrom),
        };

        setSlashState((prev) =>
          isSameSuggestionState(prev, nextState) ? prev : nextState
        );
      } else {
        closeSlashMenu();
      }

      const mentionMatch = contextText.match(
        /(?:^|\s)(@(?:"([^"]*)"|([^\s]*)))$/
      );
      if (mentionMatch) {
        const matched = mentionMatch[1] || '';
        const query =
          mentionMatch[2] !== undefined
            ? mentionMatch[2]
            : mentionMatch[3] || '';
        const rangeFrom = from - matched.length;
        const nextState: SuggestionState = {
          open: true,
          query,
          range: { from: rangeFrom, to: from },
          position: computePosition(rangeFrom),
        };

        setMentionState((prev) =>
          isSameSuggestionState(prev, nextState) ? prev : nextState
        );
        closeSlashMenu();
      } else {
        if (!showCustomDatePicker) {
          closeMentionMenu();
        }
      }
    };

    const handleBlur = () => {
      if (showCustomDatePicker) {
        closeSlashMenu();
        return;
      }
      closeSlashMenu();
      closeMentionMenu();
    };

    editorInstance.on('transaction', updateSuggestions);
    editorInstance.on('selectionUpdate', updateSuggestions);
    editorInstance.on('blur', handleBlur);

    updateSuggestions();

    return () => {
      editorInstance.off('transaction', updateSuggestions);
      editorInstance.off('selectionUpdate', updateSuggestions);
      editorInstance.off('blur', handleBlur);
    };
  }, [
    editorInstance,
    isOpen,
    closeSlashMenu,
    closeMentionMenu,
    showCustomDatePicker,
    suggestionMenuWidth,
  ]);

  // Blur editor when custom date picker opens
  useEffect(() => {
    if (showCustomDatePicker && editorInstance) {
      editorInstance.commands.blur();
    }
  }, [showCustomDatePicker, editorInstance]);

  return {
    // Slash command state
    slashState,
    setSlashState,
    slashHighlightIndex,
    setSlashHighlightIndex,
    filteredSlashCommands,
    slashListRef,
    closeSlashMenu,

    // Mention state
    mentionState,
    setMentionState,
    mentionHighlightIndex,
    setMentionHighlightIndex,
    filteredMentionOptions,
    mentionListRef,
    closeMentionMenu,

    // Custom date picker state
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
  };
}
