'use client';

import {
  Check,
  horseHead,
  Icon,
  Rabbit,
  Turtle,
  unicornHead,
} from '@tuturuuu/icons';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import { cn } from '@tuturuuu/utils/format';
import React from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../dropdown-menu';

// Priority labels (matching task-properties-section.tsx)
const PRIORITY_LABELS: Record<TaskPriority, string> = {
  critical: 'Urgent',
  high: 'High',
  normal: 'Medium',
  low: 'Low',
};

// Priority badge colors (matching taskConstants.ts)
const PRIORITY_BADGE_COLORS: Record<TaskPriority, string> = {
  critical:
    'bg-dynamic-red/20 border-dynamic-red/50 text-dynamic-red shadow-sm shadow-dynamic-red/50',
  high: 'bg-dynamic-orange/10 border-dynamic-orange/30 text-dynamic-orange',
  normal: 'bg-dynamic-yellow/10 border-dynamic-yellow/30 text-dynamic-yellow',
  low: 'bg-dynamic-blue/10 border-dynamic-blue/30 text-dynamic-blue',
};

// Priority icons (matching taskPriorityUtils.tsx)
const PRIORITY_ICONS: Record<TaskPriority, React.ReactElement> = {
  critical: <Icon iconNode={unicornHead} />,
  high: <Icon iconNode={horseHead} />,
  normal: <Rabbit />,
  low: <Turtle />,
};

function getPriorityIcon(
  priority: TaskPriority | null | undefined,
  className?: string
): React.ReactNode {
  if (!priority) return null;
  const icon = PRIORITY_ICONS[priority];
  return icon ? React.cloneElement(icon, { className } as any) : null;
}

// Priority options in order (highest to lowest)
const PRIORITY_OPTIONS: {
  value: TaskPriority;
  color: string;
}[] = [
  { value: 'critical', color: 'text-dynamic-red' },
  { value: 'high', color: 'text-dynamic-orange' },
  { value: 'normal', color: 'text-dynamic-yellow' },
  { value: 'low', color: 'text-dynamic-blue' },
];

interface PriorityDropdownProps {
  taskId: string;
  currentPriority?: string;
  onPriorityChange: (taskId: string, newPriority: string) => void;
}

export default function PriorityDropdown({
  taskId,
  currentPriority = 'normal',
  onPriorityChange,
}: PriorityDropdownProps) {
  const priority = currentPriority as TaskPriority;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'rounded p-1 transition-colors hover:bg-accent/50',
            PRIORITY_BADGE_COLORS[priority]
          )}
          aria-label="Edit priority"
        >
          {getPriorityIcon(priority, 'h-3.5 w-3.5')}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {PRIORITY_OPTIONS.map((opt) => (
          <DropdownMenuItem
            key={opt.value}
            onClick={() => onPriorityChange(taskId, opt.value)}
            className={cn(
              'flex cursor-pointer items-center gap-2',
              currentPriority === opt.value && 'bg-muted font-medium'
            )}
          >
            {getPriorityIcon(opt.value, cn('h-4 w-4', opt.color))}
            <span className="flex-1">{PRIORITY_LABELS[opt.value]}</span>
            {currentPriority === opt.value && (
              <Check className="h-4 w-4 shrink-0 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
