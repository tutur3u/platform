'use client';

import {
  ArrowRight,
  CalendarPlus,
  CircleMinus,
  type LucideIcon,
  Plus,
} from '@tuturuuu/icons';
import {
  type BoardSprint,
  MAX_OPEN_BOARD_SPRINTS,
} from '@tuturuuu/internal-api/task-sprints';
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useTranslations } from 'next-intl';
import { SprintLabel, SprintStatusIcon } from './sprint-label';
import { NEW_SPRINT, type SprintMoveTarget } from './use-board-sprints';

export interface SprintMoveOption {
  icon: LucideIcon;
  key: 'add_to_current_sprint' | 'move_to_next_sprint' | 'remove_from_sprint';
  target: SprintMoveTarget;
}

/**
 * A task's quick sprint moves: on to the next sprint (added when the task is
 * in the last one) or out of its sprint; outside every sprint, into the
 * running sprint or the one after it.
 */
export function getSprintMoveOptions(
  openSprints: BoardSprint[],
  current: BoardSprint | null
): SprintMoveOption[] {
  const ordered = [...openSprints].sort(
    (a, b) => a.sequence_number - b.sequence_number
  );
  const canAdd = ordered.length < MAX_OPEN_BOARD_SPRINTS;
  const after = (sprint: BoardSprint): SprintMoveTarget | undefined =>
    ordered.find((other) => other.sequence_number > sprint.sequence_number) ??
    (canAdd ? NEW_SPRINT : undefined);
  const options: SprintMoveOption[] = [];

  if (current) {
    const next = after(current);
    if (next)
      options.push({
        icon: ArrowRight,
        key: 'move_to_next_sprint',
        target: next,
      });
    options.push({
      icon: CircleMinus,
      key: 'remove_from_sprint',
      target: null,
    });
    return options;
  }

  const running = ordered.find((sprint) => sprint.status === 'active');
  if (running)
    options.push({
      icon: CalendarPlus,
      key: 'add_to_current_sprint',
      target: running,
    });
  const next = running ? after(running) : ordered[0];
  if (next)
    options.push({
      icon: ArrowRight,
      key: 'move_to_next_sprint',
      target: next,
    });
  return options;
}

/**
 * The quick moves, then Move to… with every other open sprint and, under
 * the open-sprint limit, a new one unless Next sprint already adds it.
 */
export function SprintMoveItems({
  current,
  onMove,
  openSprints,
}: {
  current: BoardSprint | null;
  onMove: (target: SprintMoveTarget) => void;
  openSprints: BoardSprint[];
}) {
  const t = useTranslations('ws-task-boards.sprints');
  const others = openSprints
    .filter((sprint) => sprint.id !== current?.id)
    .sort((a, b) => a.sequence_number - b.sequence_number);
  const quick = getSprintMoveOptions(openSprints, current);
  // Next sprint already adds one when the task is in the last sprint.
  const canAdd =
    openSprints.length < MAX_OPEN_BOARD_SPRINTS &&
    !quick.some((option) => option.target === NEW_SPRINT);

  return (
    <>
      {quick.map(({ icon: Icon, key, target }) => (
        <DropdownMenuItem key={key} onSelect={() => onMove(target)}>
          <Icon className="size-4 text-muted-foreground" />
          {t(key)}
        </DropdownMenuItem>
      ))}
      {others.length || canAdd ? (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <CalendarPlus className="size-4 text-muted-foreground" />
              {t('move_to')}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-56">
              {others.map((sprint) => (
                <DropdownMenuItem
                  key={sprint.id}
                  onSelect={() => onMove(sprint)}
                >
                  <SprintStatusIcon sprint={sprint} />
                  <SprintLabel sprint={sprint} />
                </DropdownMenuItem>
              ))}
              {canAdd ? (
                <DropdownMenuItem onSelect={() => onMove(NEW_SPRINT)}>
                  <Plus className="size-4 text-muted-foreground" />
                  {t('new_sprint')}
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </>
      ) : null}
    </>
  );
}
