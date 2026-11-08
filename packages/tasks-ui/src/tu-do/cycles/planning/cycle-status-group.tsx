'use client';

import { ChevronRight } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { CycleStatusGroup } from './cycle-planning-model';

interface CycleStatusGroupSectionProps {
  group: CycleStatusGroup;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}

/** A collapsible status section with its count, sidebar style. */
export function CycleStatusGroupSection({
  group,
  collapsed,
  onToggle,
  children,
}: CycleStatusGroupSectionProps) {
  const t = useTranslations('task-cycle-planning');
  const label = t(`status_${group.status}`);

  return (
    <section aria-label={label}>
      <button
        type="button"
        aria-expanded={!collapsed}
        onClick={onToggle}
        className="flex h-7 w-full items-center gap-1.5 rounded-md px-1 font-medium text-muted-foreground text-xs hover:text-foreground"
      >
        <ChevronRight
          className={cn(
            'size-3.5 transition-transform',
            !collapsed && 'rotate-90'
          )}
        />
        <span>{label}</span>
        <span className="tabular-nums">{group.tasks.length}</span>
      </button>
      {!collapsed && <ul className="pb-1">{children}</ul>}
    </section>
  );
}
