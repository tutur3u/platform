import {
  Circle,
  CircleCheck,
  CircleDashed,
  CircleX,
  FileText,
  ListTodo,
} from '@tuturuuu/icons';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import type { TaskBoardStatus } from '@tuturuuu/types/primitives/TaskBoard';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type { ComponentType } from 'react';

/** Popover trigger / summary chip: border/bg/text from list column color; icon from status */
export const listTriggerSurfaceClass: Record<SupportedColor, string> = {
  GRAY: 'border-dynamic-gray/30 bg-dynamic-gray/15 text-dynamic-gray hover:border-dynamic-gray/50 hover:bg-dynamic-gray/20',
  RED: 'border-dynamic-red/30 bg-dynamic-red/15 text-dynamic-red hover:border-dynamic-red/50 hover:bg-dynamic-red/20',
  BLUE: 'border-dynamic-blue/30 bg-dynamic-blue/15 text-dynamic-blue hover:border-dynamic-blue/50 hover:bg-dynamic-blue/20',
  GREEN:
    'border-dynamic-green/30 bg-dynamic-green/15 text-dynamic-green hover:border-dynamic-green/50 hover:bg-dynamic-green/20',
  YELLOW:
    'border-dynamic-yellow/30 bg-dynamic-yellow/15 text-dynamic-yellow hover:border-dynamic-yellow/50 hover:bg-dynamic-yellow/20',
  ORANGE:
    'border-dynamic-orange/30 bg-dynamic-orange/15 text-dynamic-orange hover:border-dynamic-orange/50 hover:bg-dynamic-orange/20',
  PURPLE:
    'border-dynamic-purple/30 bg-dynamic-purple/15 text-dynamic-purple hover:border-dynamic-purple/50 hover:bg-dynamic-purple/20',
  PINK: 'border-dynamic-pink/30 bg-dynamic-pink/15 text-dynamic-pink hover:border-dynamic-pink/50 hover:bg-dynamic-pink/20',
  INDIGO:
    'border-dynamic-indigo/30 bg-dynamic-indigo/15 text-dynamic-indigo hover:border-dynamic-indigo/50 hover:bg-dynamic-indigo/20',
  CYAN: 'border-dynamic-cyan/30 bg-dynamic-cyan/15 text-dynamic-cyan hover:border-dynamic-cyan/50 hover:bg-dynamic-cyan/20',
};

export const taskListStatusIcon: Record<
  TaskBoardStatus,
  ComponentType<{ className?: string }>
> = {
  not_started: CircleDashed,
  active: Circle,
  done: CircleCheck,
  closed: CircleX,
  documents: FileText,
};

/** Group header icon tone (status semantics, independent of list column color) */
export const taskListStatusToneClass: Record<TaskBoardStatus, string> = {
  not_started: 'text-dynamic-gray',
  active: 'text-dynamic-blue',
  done: 'text-dynamic-green',
  closed: 'text-dynamic-purple',
  documents: 'text-dynamic-cyan',
};

export function getTaskListTriggerSurfaceClass(
  list: TaskList | undefined
): string | null {
  if (!list) return null;
  const key = list.color ?? 'GRAY';
  return listTriggerSurfaceClass[key] ?? listTriggerSurfaceClass.GRAY;
}

export function getTaskListTriggerIcon(
  list: TaskList | undefined
): ComponentType<{ className?: string }> {
  if (!list) return ListTodo;
  return taskListStatusIcon[list.status];
}
