import { ChevronDown, UserX } from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { TaskFilters } from '../task-filter.types';
import {
  type BoardPerson,
  getSelectedPersonIds,
  togglePersonFilter,
  toggleUnassignedFilter,
} from './board-filter-state';

// Five people show; a narrow header shows two, the rest go to More.
const VISIBLE_PEOPLE = 5;
const NARROW_VISIBLE_PEOPLE = 2;
const WIDE_ONLY_CLASS = 'hidden @sm/board-header:inline-flex';

const PILL_CLASS =
  'inline-flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border py-0 pr-1 pl-1 font-medium text-xs transition-[background-color,color,opacity] @xl/board-header:pr-3';
// Names drop first when the header narrows; the avatar and hover name stay.
const NAME_CLASS = 'hidden @xl/board-header:inline';

function personName(person: BoardPerson) {
  return person.display_name || person.email || '?';
}

function PersonAvatar({ person }: { person: BoardPerson }) {
  return (
    <Avatar className="size-6">
      {person.avatar_url ? <AvatarImage src={person.avatar_url} /> : null}
      <AvatarFallback className="text-xs">
        {personName(person).charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

/** People pills by name. Picking yourself alone is "Mine". */
export function BoardPeopleFilter({
  currentUserId,
  filters,
  onFiltersChange,
  people,
  unassignedCount,
  countsComplete = true,
}: {
  currentUserId?: string;
  filters: TaskFilters;
  onFiltersChange: (filters: TaskFilters) => void;
  people: BoardPerson[];
  unassignedCount: number;
  countsComplete?: boolean;
}) {
  const t = useTranslations();
  const selected = getSelectedPersonIds(filters, currentUserId);
  const anySelected = selected.size > 0 || filters.includeUnassigned;
  const visible = people.slice(0, VISIBLE_PEOPLE);
  const overflow = people.slice(NARROW_VISIBLE_PEOPLE);
  const wideOverflowCount = Math.max(0, people.length - VISIBLE_PEOPLE);
  const overflowSelected = overflow.filter((person) => selected.has(person.id));

  const pillClass = (on: boolean) =>
    cn(
      PILL_CLASS,
      on
        ? 'border-dynamic-blue/60 bg-dynamic-blue/15 text-dynamic-blue'
        : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
      anySelected && !on && 'opacity-55 hover:opacity-100'
    );
  const togglePerson = (personId: string) =>
    onFiltersChange(
      togglePersonFilter(filters, personId, people, currentUserId)
    );
  const title = (person: BoardPerson) => {
    const name =
      person.id === currentUserId
        ? t('ws-task-boards.header.you', { name: personName(person) })
        : personName(person);
    return countsComplete
      ? `${name} · ${t('ws-task-boards.header.task_count', {
          count: person.taskCount,
        })}`
      : name;
  };

  if (people.length === 0 && unassignedCount === 0 && countsComplete)
    return null;

  return (
    <fieldset
      aria-label={t('common.people')}
      className="flex min-w-0 items-center gap-1"
    >
      {visible.map((person, index) => {
        const on = selected.has(person.id);
        return (
          <button
            key={person.id}
            aria-label={personName(person)}
            aria-pressed={on}
            className={cn(
              pillClass(on),
              index >= NARROW_VISIBLE_PEOPLE && WIDE_ONLY_CLASS
            )}
            onClick={() => togglePerson(person.id)}
            title={title(person)}
            type="button"
          >
            <PersonAvatar person={person} />
            <span className={NAME_CLASS}>{personName(person)}</span>
          </button>
        );
      })}
      {overflow.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                pillClass(overflowSelected.length > 0),
                'pl-3',
                wideOverflowCount === 0 && '@sm/board-header:hidden'
              )}
              type="button"
            >
              <span className="@sm/board-header:hidden">
                +{overflow.length}
              </span>
              {wideOverflowCount > 0 ? (
                <span className="@sm/board-header:inline hidden">
                  {t('ws-task-boards.header.more_people', {
                    count: wideOverflowCount,
                  })}
                </span>
              ) : null}
              <ChevronDown className="size-3.5 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {overflow.map((person, index) => (
              <DropdownMenuCheckboxItem
                key={person.id}
                // These also get a pill once the header is wide enough.
                className={cn(
                  index < VISIBLE_PEOPLE - NARROW_VISIBLE_PEOPLE &&
                    '@sm/board-header:hidden'
                )}
                checked={selected.has(person.id)}
                onCheckedChange={() => togglePerson(person.id)}
                onSelect={(event) => event.preventDefault()}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <PersonAvatar person={person} />
                  <span className="truncate">{personName(person)}</span>
                </span>
                {countsComplete ? (
                  <span className="text-muted-foreground text-xs">
                    {person.taskCount}
                  </span>
                ) : null}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {unassignedCount > 0 || !countsComplete || filters.includeUnassigned ? (
        <button
          aria-label={t('common.unassigned')}
          aria-pressed={filters.includeUnassigned}
          className={pillClass(filters.includeUnassigned)}
          onClick={() => onFiltersChange(toggleUnassignedFilter(filters))}
          title={
            countsComplete
              ? `${t('common.unassigned')} · ${t(
                  'ws-task-boards.header.task_count',
                  { count: unassignedCount }
                )}`
              : t('common.unassigned')
          }
          type="button"
        >
          <span className="grid size-6 place-items-center rounded-full border border-current border-dashed">
            <UserX className="size-3.5" />
          </span>
          <span className={NAME_CLASS}>{t('common.unassigned')}</span>
        </button>
      ) : null}
    </fieldset>
  );
}
