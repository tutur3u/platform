'use client';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { MEET_NAVIGATION_MAX_TARGETS } from '@tuturuuu/realtime/meet';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import type {
  NavigationPerson,
  NavigationTargets,
} from '../hooks/use-room-navigation';

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    parts.length > 1
      ? `${parts[0]![0]}${parts.at(-1)![0]}`
      : (parts[0]?.slice(0, 2) ?? '?');
  return letters.toLocaleUpperCase();
}

/** Selection for Follow and Summon: everyone, or a set of people. */
export function useTargetSelection(people: readonly NavigationPerson[]) {
  const [everyone, setEveryone] = useState(false);
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const present = people.map((person) => person.userId);
  const selected = present
    .filter((id) => picked.has(id))
    .slice(0, MEET_NAVIGATION_MAX_TARGETS);
  const targets: NavigationTargets | null = everyone
    ? 'everyone'
    : selected.length
      ? selected
      : null;
  return {
    everyone,
    picked,
    count: everyone ? present.length : selected.length,
    targets,
    setEveryone,
    toggle: (userId: string) =>
      setPicked((current) => {
        const next = new Set(current);
        if (next.has(userId)) next.delete(userId);
        else next.add(userId);
        return next;
      }),
    reset: () => {
      setEveryone(false);
      setPicked(new Set());
    },
  };
}
export type TargetSelection = ReturnType<typeof useTargetSelection>;

export function RoomNavigationTargets({
  people,
  selection,
}: {
  people: readonly NavigationPerson[];
  selection: TargetSelection;
}) {
  const t = useTranslations('meet.call.navigation');
  const id = useId();
  const row =
    'flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2.5 text-sm hover:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring';
  return (
    <div className="grid gap-1">
      <label htmlFor={`${id}-everyone`} className={row}>
        <Checkbox
          id={`${id}-everyone`}
          checked={selection.everyone}
          onCheckedChange={(value) => selection.setEveryone(value === true)}
        />
        <span className="flex-1 font-semibold">{t('everyone')}</span>
        <span className="text-muted-foreground text-xs">
          {t('people_count', { count: people.length })}
        </span>
      </label>
      <div className="mx-1 h-px bg-border" />
      <ul className="grid max-h-64 gap-1 overflow-y-auto">
        {people.map((person) => {
          const checked =
            selection.everyone || selection.picked.has(person.userId);
          return (
            <li key={person.userId}>
              <label htmlFor={`${id}-${person.userId}`} className={row}>
                <Checkbox
                  id={`${id}-${person.userId}`}
                  checked={checked}
                  disabled={selection.everyone}
                  onCheckedChange={() => selection.toggle(person.userId)}
                />
                <Avatar className="size-7">
                  {person.avatarUrl && (
                    <AvatarImage src={person.avatarUrl} alt="" />
                  )}
                  <AvatarFallback className="font-semibold text-[11px]">
                    {initials(person.displayName)}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 truncate">
                  {person.displayName}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
