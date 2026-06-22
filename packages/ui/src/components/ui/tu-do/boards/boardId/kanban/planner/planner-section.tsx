'use client';

import { ChevronDown } from '@tuturuuu/icons';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import { cn } from '@tuturuuu/utils/format';
import { type ReactNode, useState } from 'react';

interface PlannerSectionProps {
  badge?: ReactNode;
  children: ReactNode;
  disabled?: boolean;
  title: string;
}

export function PlannerSection({
  badge,
  children,
  disabled,
  title,
}: PlannerSectionProps) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-md border bg-background"
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="flex min-h-11 w-full items-center justify-between gap-3 px-3 text-left transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium text-sm">{title}</span>
            {badge}
          </span>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-180'
            )}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t p-3">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
