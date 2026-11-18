'use client';

import type { Task } from '@tuturuuu/types/primitives/Task';
import { FleetStatusChip, NeedsUserBadge } from '@tuturuuu/ui/custom/fleet';
import { cn } from '@tuturuuu/utils/format';
import { getFleetProduct } from './fleet-format';
import { FleetTaskCard } from './fleet-task-card';
import type { FleetBucket, FleetGroup, FleetGroupBy } from './fleet-triage';
import type { FleetCopy } from './use-fleet-copy';

const BUCKET_DOT: Record<FleetBucket, string> = {
  needs_me: 'bg-dynamic-yellow',
  live: 'bg-dynamic-blue',
  blocked: 'bg-dynamic-red',
};
const PRIORITY_CODE: Record<string, string> = {
  critical: 'P0',
  high: 'P1',
  normal: 'P2',
  low: 'P3',
};

interface FleetGroupSectionProps {
  group: FleetGroup<Task>;
  groupBy: FleetGroupBy;
  copy: FleetCopy;
  density: 'comfortable' | 'compact';
  now: number;
  onOpen: (task: Task) => void;
}

function groupHeading(
  group: FleetGroup<Task>,
  groupBy: FleetGroupBy,
  copy: FleetCopy
) {
  if (groupBy === 'triage')
    return {
      label: copy.bucket[group.key as FleetBucket],
      dot: BUCKET_DOT[group.key as FleetBucket],
    };
  if (!group.key)
    return { label: copy.view.noGroup, dot: 'bg-muted-foreground' };
  if (groupBy === 'product') {
    const product = getFleetProduct(group.key);
    return {
      label: product?.label ?? group.key,
      dot: product?.dotClassName ?? 'bg-muted-foreground',
    };
  }
  if (groupBy === 'priority') {
    return {
      label:
        `${PRIORITY_CODE[group.key] ?? ''} ${copy.priority[group.key as keyof FleetCopy['priority']] ?? group.key}`.trim(),
      dot: 'bg-muted-foreground',
    };
  }
  return { label: group.key, dot: 'bg-muted-foreground' };
}

/** One triage column, or one product/priority/owner group, of fleet cards. */
export function FleetGroupSection({
  group,
  groupBy,
  copy,
  density,
  now,
  onOpen,
}: FleetGroupSectionProps) {
  const heading = groupHeading(group, groupBy, copy);
  const isColumn = groupBy === 'triage';
  return (
    <section
      aria-label={heading.label}
      className="flex min-w-0 flex-col gap-2.5 rounded-2xl bg-muted/60 p-2.5"
    >
      <header className="flex flex-wrap items-center gap-2 px-1 pt-0.5">
        <span
          aria-hidden
          className={cn('size-2 shrink-0 rounded-full', heading.dot)}
        />
        <h2 className="m-0 font-bold text-sm">{heading.label}</h2>
        <span className="font-mono text-muted-foreground text-xs tabular-nums">
          {group.items.length}
        </span>
        {!isColumn && group.needsMe > 0 ? (
          <NeedsUserBadge label={copy.view.needsCount(group.needsMe)} />
        ) : null}
        {!isColumn && group.blocked > 0 ? (
          <FleetStatusChip
            label={copy.view.blockedCount(group.blocked)}
            status="blocked"
          />
        ) : null}
      </header>
      {group.items.length === 0 ? (
        <p className="m-0 px-1 pb-1 text-muted-foreground text-sm">
          {copy.view.emptyBucket}
        </p>
      ) : (
        <div
          className={cn(
            'grid gap-2',
            !isColumn &&
              'grid-cols-[repeat(auto-fill,minmax(17.5rem,1fr))] items-start gap-3'
          )}
        >
          {group.items.map((item) => (
            <FleetTaskCard
              code={
                item.task.display_number ? `#${item.task.display_number}` : null
              }
              copy={copy}
              density={density}
              item={item}
              key={item.task.id}
              now={now}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </section>
  );
}
