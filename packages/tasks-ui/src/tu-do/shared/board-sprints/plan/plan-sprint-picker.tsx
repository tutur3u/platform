'use client';

import { ChevronDown, Layers, Plus, Trash } from '@tuturuuu/icons';
import {
  type BoardSprint,
  MAX_OPEN_BOARD_SPRINTS,
} from '@tuturuuu/internal-api/task-sprints';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { isBoardSprintOpen } from '@tuturuuu/utils/task-helper/sprints';
import { useTranslations } from 'next-intl';
import { SprintLabel } from '../sprint-label';
import { SprintStatusIcon } from '../sprint-move-items';

/** The Plan view's value for every sprint at once. */
export const ALL_SPRINTS = 'all';

/**
 * The sprint Plan shows, as its title: open sprints, then ended ones newest
 * first, then all sprints. Planners add a sprint here, or remove the last one.
 */
export function PlanSprintPicker({
  canPlan,
  onAdd,
  onRemove,
  onSelect,
  selected,
  sprints,
}: {
  canPlan: boolean;
  onAdd: () => void;
  onRemove: (sprint: BoardSprint) => void;
  onSelect: (value: string) => void;
  selected: BoardSprint | null;
  sprints: BoardSprint[];
}) {
  const t = useTranslations('ws-task-boards.sprints');
  const open = sprints.filter(isBoardSprintOpen);
  const ended = sprints
    .filter((sprint) => !isBoardSprintOpen(sprint))
    .reverse();
  const planned = open.filter((sprint) => sprint.status === 'planned');
  const next = planned[0];
  // Only the last planned sprint goes, and one planned sprint always stays.
  const removable = planned.length > 1 ? planned.at(-1) : undefined;
  const title = selected?.name ?? t('all_sprints');
  const tag = (sprint: BoardSprint) =>
    sprint.status === 'active'
      ? t('active')
      : sprint.id === next?.id
        ? t('next')
        : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={t('switcher_label', { name: title })}
          className="inline-flex h-8 min-w-0 items-center gap-1 rounded-md pr-1.5 pl-2 font-semibold text-foreground text-sm transition-colors hover:bg-muted"
          type="button"
        >
          <span className="truncate">{title}</span>
          <ChevronDown className="size-3.5 shrink-0 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuRadioGroup
          onValueChange={onSelect}
          value={selected?.id ?? ALL_SPRINTS}
        >
          {open.map((sprint) => (
            <DropdownMenuRadioItem key={sprint.id} value={sprint.id}>
              <SprintStatusIcon sprint={sprint} />
              <SprintLabel className="flex-1" sprint={sprint} />
              {tag(sprint) ? (
                <span className="text-muted-foreground text-xs">
                  {tag(sprint)}
                </span>
              ) : null}
            </DropdownMenuRadioItem>
          ))}
          {ended.length ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-muted-foreground text-xs">
                {t('ended_sprints')}
              </DropdownMenuLabel>
              {ended.map((sprint) => (
                <DropdownMenuRadioItem key={sprint.id} value={sprint.id}>
                  <SprintStatusIcon sprint={sprint} />
                  <SprintLabel sprint={sprint} />
                </DropdownMenuRadioItem>
              ))}
            </>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuRadioItem value={ALL_SPRINTS}>
            <Layers className="size-4 text-muted-foreground" />
            {t('all_sprints')}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        {canPlan ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={open.length >= MAX_OPEN_BOARD_SPRINTS}
              onSelect={onAdd}
            >
              <Plus className="size-4" />
              <span className="flex-1">{t('add_sprint')}</span>
              {open.length >= MAX_OPEN_BOARD_SPRINTS ? (
                <span className="text-muted-foreground text-xs">
                  {t('sprint_limit', { count: MAX_OPEN_BOARD_SPRINTS })}
                </span>
              ) : null}
            </DropdownMenuItem>
            {removable ? (
              <DropdownMenuItem
                className="text-dynamic-red focus:text-dynamic-red"
                onSelect={() => onRemove(removable)}
              >
                <Trash className="size-4" />
                {t('remove_sprint', { name: removable.name })}
              </DropdownMenuItem>
            ) : null}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
