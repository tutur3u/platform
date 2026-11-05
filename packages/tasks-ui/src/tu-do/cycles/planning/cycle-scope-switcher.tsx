'use client';

import { ToggleGroup, ToggleGroupItem } from '@tuturuuu/ui/toggle-group';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { CyclePlanningScope } from './types';

export const CYCLE_SCOPES: readonly CyclePlanningScope[] = [
  'current',
  'next',
  'backlog',
];

/** Drag payload type for a task row dragged onto a scope. */
export const CYCLE_TASK_DRAG_TYPE = 'application/x-tuturuuu-cycle-task';

interface CycleScopeSwitcherProps {
  scope: CyclePlanningScope;
  onScopeChange: (scope: CyclePlanningScope) => void;
  /** Scopes that can receive a dropped task (they have a cycle). */
  dropTargets: readonly CyclePlanningScope[];
  onTaskDrop: (scope: CyclePlanningScope, taskId: string) => void;
}

/** Current cycle | Next | Backlog. Each option is also a drop target. */
export function CycleScopeSwitcher({
  scope,
  onScopeChange,
  dropTargets,
  onTaskDrop,
}: CycleScopeSwitcherProps) {
  const t = useTranslations('task-cycle-planning');
  const [hovered, setHovered] = useState<CyclePlanningScope | null>(null);

  return (
    <ToggleGroup
      type="single"
      size="sm"
      value={scope}
      onValueChange={(value) => {
        if (value) onScopeChange(value as CyclePlanningScope);
      }}
      aria-label={t('scope')}
      className="shrink-0 rounded-md border p-0.5"
    >
      {CYCLE_SCOPES.map((value) => {
        const canDrop = value !== scope && dropTargets.includes(value);
        return (
          <ToggleGroupItem
            key={value}
            value={value}
            onDragOver={(event) => {
              if (!canDrop) return;
              event.preventDefault();
              setHovered(value);
            }}
            onDragLeave={() => setHovered(null)}
            onDrop={(event) => {
              setHovered(null);
              if (!canDrop) return;
              event.preventDefault();
              const taskId = event.dataTransfer.getData(CYCLE_TASK_DRAG_TYPE);
              if (taskId) onTaskDrop(value, taskId);
            }}
            className={cn(
              'h-7 px-2.5 text-muted-foreground data-[state=on]:bg-muted data-[state=on]:text-foreground',
              hovered === value && 'ring-1 ring-primary'
            )}
          >
            {t(`scope_${value}`)}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}
