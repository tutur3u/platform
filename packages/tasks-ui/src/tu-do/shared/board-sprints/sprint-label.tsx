'use client';

import { Circle, CircleCheck, CircleDashed } from '@tuturuuu/icons';
import type { BoardSprint } from '@tuturuuu/internal-api/task-sprints';
import { cn } from '@tuturuuu/utils/format';
import { formatSprintShortRange } from '@tuturuuu/utils/task-helper/sprints';
import { useLocale } from 'next-intl';

/**
 * A sprint's name with its dates ("Sprint 3 9 – 13 Nov"), so a number never
 * stands alone. `chip` sets it as a small tag on a task row.
 */
export function SprintLabel({
  chip = false,
  className,
  sprint,
}: {
  chip?: boolean;
  className?: string;
  /** null renders nothing, for rows that only sometimes carry a sprint. */
  sprint: Pick<BoardSprint, 'end_date' | 'name' | 'start_date'> | null;
}) {
  const locale = useLocale();
  if (!sprint) return null;
  const range = formatSprintShortRange(sprint, locale);

  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-baseline gap-1.5 whitespace-nowrap',
        chip && 'rounded-md bg-muted px-1.5 py-0.5 text-xs',
        className
      )}
    >
      <span className="truncate">{sprint.name}</span>
      {range ? (
        <span className="text-muted-foreground text-xs">{range}</span>
      ) : null}
    </span>
  );
}

export function SprintStatusIcon({
  sprint,
}: {
  sprint: Pick<BoardSprint, 'status'>;
}) {
  const Icon =
    sprint.status === 'active'
      ? Circle
      : sprint.status === 'completed'
        ? CircleCheck
        : CircleDashed;
  return (
    <Icon
      className={
        sprint.status === 'active'
          ? 'size-4 text-dynamic-green'
          : 'size-4 text-muted-foreground'
      }
    />
  );
}
