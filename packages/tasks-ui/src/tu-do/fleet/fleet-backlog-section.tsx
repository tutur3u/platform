'use client';

import { ChevronRight } from '@tuturuuu/icons';
import type { Task } from '@tuturuuu/types/primitives/Task';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import { FleetTaskCard } from './fleet-task-card';
import type { FleetItem } from './fleet-triage';
import type { FleetCopy } from './use-fleet-copy';

interface FleetBacklogSectionProps {
  label: string;
  items: FleetItem<Task>[];
  /** Cards that exist but are not listed here. */
  overflow?: number;
  copy: FleetCopy;
  now: number;
  onOpen: (task: Task) => void;
}

/**
 * A collapsed list of cards the triage leaves out (up next, recently done).
 * Closed by default so the triage stays the first thing on screen.
 */
export function FleetBacklogSection({
  label,
  items,
  overflow = 0,
  copy,
  now,
  onOpen,
}: FleetBacklogSectionProps) {
  if (items.length === 0 && overflow === 0) return null;
  return (
    <Collapsible asChild>
      <section aria-label={label} className="group rounded-2xl bg-muted/60 p-1">
        <h2 className="m-0 font-bold text-sm">
          <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ChevronRight
              aria-hidden
              className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90"
            />
            <span>{label}</span>
            <span className="font-medium font-mono text-muted-foreground text-xs tabular-nums">
              {items.length + overflow}
            </span>
          </CollapsibleTrigger>
        </h2>
        <CollapsibleContent>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(17.5rem,1fr))] items-start gap-2 p-1.5">
            {items.map((item) => (
              <FleetTaskCard
                copy={copy}
                density="compact"
                item={item}
                key={item.task.id}
                now={now}
                onOpen={onOpen}
              />
            ))}
          </div>
          {overflow > 0 ? (
            <p className="m-0 px-2.5 pb-1.5 text-muted-foreground text-xs">
              {copy.view.moreOnBoard(overflow)}
            </p>
          ) : null}
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}
