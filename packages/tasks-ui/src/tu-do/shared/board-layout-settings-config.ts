import {
  Circle,
  CircleCheck,
  CircleDashed,
  CircleX,
  ClipboardCheck,
  FileText,
} from '@tuturuuu/icons';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import type { TaskBoardStatus } from '@tuturuuu/types/primitives/TaskBoard';

export const BOARD_LIST_STATUSES: TaskBoardStatus[] = [
  'documents',
  'not_started',
  'active',
  'review',
  'done',
  'closed',
];

export const boardStatusConfig = {
  not_started: {
    icon: CircleDashed,
    color: 'text-dynamic-gray',
    bgColor: 'bg-dynamic-gray/10',
    borderColor: 'border-dynamic-gray/30',
  },
  active: {
    icon: Circle,
    color: 'text-dynamic-blue',
    bgColor: 'bg-dynamic-blue/10',
    borderColor: 'border-dynamic-blue/30',
  },
  review: {
    icon: ClipboardCheck,
    color: 'text-dynamic-orange',
    bgColor: 'bg-dynamic-orange/10',
    borderColor: 'border-dynamic-orange/30',
  },
  done: {
    icon: CircleCheck,
    color: 'text-dynamic-green',
    bgColor: 'bg-dynamic-green/10',
    borderColor: 'border-dynamic-green/30',
  },
  closed: {
    icon: CircleX,
    color: 'text-dynamic-purple',
    bgColor: 'bg-dynamic-purple/10',
    borderColor: 'border-dynamic-purple/30',
  },
  documents: {
    icon: FileText,
    color: 'text-dynamic-cyan',
    bgColor: 'bg-dynamic-cyan/10',
    borderColor: 'border-dynamic-cyan/30',
  },
} satisfies Record<
  TaskBoardStatus,
  {
    icon: typeof Circle;
    color: string;
    bgColor: string;
    borderColor: string;
  }
>;

export const boardListColorClasses: Record<SupportedColor, string> = {
  GRAY: 'border-dynamic-gray/30 bg-dynamic-gray/10',
  RED: 'border-dynamic-red/30 bg-dynamic-red/10',
  BLUE: 'border-dynamic-blue/30 bg-dynamic-blue/10',
  GREEN: 'border-dynamic-green/30 bg-dynamic-green/10',
  YELLOW: 'border-dynamic-yellow/30 bg-dynamic-yellow/10',
  ORANGE: 'border-dynamic-orange/30 bg-dynamic-orange/10',
  PURPLE: 'border-dynamic-purple/30 bg-dynamic-purple/10',
  PINK: 'border-dynamic-pink/30 bg-dynamic-pink/10',
  INDIGO: 'border-dynamic-indigo/30 bg-dynamic-indigo/10',
  CYAN: 'border-dynamic-cyan/30 bg-dynamic-cyan/10',
};
