import type { LucideIcon } from '@tuturuuu/icons';
import {
  Calendar,
  CirclePlus,
  Flag,
  Settings,
  Trash,
  Users,
} from '@tuturuuu/icons';

export interface SlashCommandDefinition {
  id:
    | 'assign'
    | 'due-today'
    | 'due-tomorrow'
    | 'due-next-week'
    | 'clear-due'
    | 'priority-critical'
    | 'priority-high'
    | 'priority-normal'
    | 'priority-low'
    | 'priority-clear'
    | 'toggle-advanced'
    | 'convert-to-task';
  label: string;
  description?: string;
  icon: LucideIcon;
  keywords: string[];
  disabled?: boolean;
}

export function getSlashCommands(options: {
  hasMembers: boolean;
  hasEndDate: boolean;
  hasPriority: boolean;
  showAdvanced: boolean;
}): SlashCommandDefinition[] {
  const { hasMembers, hasEndDate, hasPriority, showAdvanced } = options;

  return [
    {
      id: 'assign',
      label: 'Assign member',
      description: 'Mention and assign someone quickly',
      icon: Users,
      keywords: ['assign', 'assignee', 'member', 'mention'],
      disabled: !hasMembers,
    },
    {
      id: 'due-today',
      label: 'Due today',
      description: 'Set due date to end of today',
      icon: Calendar,
      keywords: ['due', 'today', 'deadline', 'tod'],
    },
    {
      id: 'due-tomorrow',
      label: 'Due tomorrow',
      description: 'Set due date to end of tomorrow',
      icon: Calendar,
      keywords: ['due', 'tomorrow', 'tom'],
    },
    {
      id: 'due-next-week',
      label: 'Due next week',
      description: 'Set due date to a week from now',
      icon: Calendar,
      keywords: ['due', 'week', 'next'],
    },
    {
      id: 'clear-due',
      label: 'Clear due date',
      description: 'Remove the current due date',
      icon: Trash,
      keywords: ['due', 'clear', 'remove'],
      disabled: !hasEndDate,
    },
    {
      id: 'priority-critical',
      label: 'Priority: Critical',
      description: 'Mark as critical priority',
      icon: Flag,
      keywords: ['priority', 'critical', 'urgent'],
    },
    {
      id: 'priority-high',
      label: 'Priority: High',
      description: 'Mark as high priority',
      icon: Flag,
      keywords: ['priority', 'high'],
    },
    {
      id: 'priority-normal',
      label: 'Priority: Normal',
      description: 'Mark as normal priority',
      icon: Flag,
      keywords: ['priority', 'normal', 'medium'],
    },
    {
      id: 'priority-low',
      label: 'Priority: Low',
      description: 'Mark as low priority',
      icon: Flag,
      keywords: ['priority', 'low'],
    },
    {
      id: 'priority-clear',
      label: 'Clear priority',
      description: 'Remove current priority value',
      icon: Trash,
      keywords: ['priority', 'clear', 'remove'],
      disabled: !hasPriority,
    },
    {
      id: 'toggle-advanced',
      label: showAdvanced ? 'Hide advanced options' : 'Show advanced options',
      description: 'Toggle the advanced settings panel',
      icon: Settings,
      keywords: ['advanced', 'options', 'settings'],
    },
    {
      id: 'convert-to-task',
      label: 'Convert to task',
      description: 'Convert selected text or list item into a new task',
      icon: CirclePlus,
      keywords: ['convert', 'task', 'create', 'new', 'mention'],
    },
  ];
}

// Normalize text for search
export const normalizeForSearch = (text: string): string => {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
};

export function filterSlashCommands(
  commands: SlashCommandDefinition[],
  query: string
): SlashCommandDefinition[] {
  const normalizedQuery = normalizeForSearch(query.trim());

  return commands.filter((command) => {
    if (command.disabled) return false;
    if (!normalizedQuery) return true;

    const searchTexts = [
      command.label,
      command.description || '',
      ...command.keywords,
    ];

    const normalizedTexts = searchTexts.map(normalizeForSearch);

    if (normalizedTexts.some((text) => text.includes(normalizedQuery))) {
      return true;
    }

    const queryWords = normalizedQuery.split(/\s+/);
    return queryWords.every((word) =>
      normalizedTexts.some((text) => text.includes(word))
    );
  });
}
