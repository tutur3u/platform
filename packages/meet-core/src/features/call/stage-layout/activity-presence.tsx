'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';

export interface ActivityPresencePerson {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  /** True when this participant is currently following a leader in the activity. */
  following?: boolean;
  /** Activity title shown in dock tooltips when aggregating across activities. */
  activityTitle?: string;
}

const MAX_AVATARS = 4;

/**
 * Consistent live presence avatar row shown in every activity pane header.
 * Mirrors the shared document's avatar stack with semantic tokens only.
 */
export function ActivityPresenceRow({
  activityId,
  people,
  compact = false,
}: {
  activityId: string;
  people: readonly ActivityPresencePerson[];
  compact?: boolean;
}) {
  const t = useTranslations('meet.call.stage_layout');
  if (!people.length) return null;
  const visible = people.slice(0, MAX_AVATARS);
  const overflow = people.length - visible.length;
  return (
    <ul
      data-activity-presence={activityId}
      aria-label={t('presence_in_activity', { count: people.length })}
      className="flex shrink-0 items-center -space-x-1.5"
    >
      {visible.map((person) => {
        const tooltip = person.following
          ? t('following_in_activity', { name: person.displayName })
          : person.displayName;
        return (
          <li key={person.userId}>
            <Avatar
              className={cn(
                compact ? 'size-5' : 'size-6',
                'border-2 border-card',
                person.following && 'ring-1 ring-foreground/30'
              )}
              title={tooltip}
              aria-label={tooltip}
            >
              {person.avatarUrl && (
                <AvatarImage src={person.avatarUrl} alt={person.displayName} />
              )}
              <AvatarFallback className="text-[10px] font-medium">
                {Array.from(person.displayName)[0]?.toLocaleUpperCase() ?? '?'}
              </AvatarFallback>
            </Avatar>
          </li>
        );
      })}
      {overflow > 0 && (
        <li
          className="grid size-6 place-items-center rounded-full border-2 border-card bg-muted px-1 font-medium text-[10px] text-muted-foreground"
          title={people
            .slice(MAX_AVATARS)
            .map((person) => person.displayName)
            .join(', ')}
        >
          +{overflow}
        </li>
      )}
    </ul>
  );
}

/**
 * Compact presence indicator on the Activities dock trigger showing who is
 * currently inside open activities.
 */
export function ActivityDockPresence({
  people,
}: {
  people: readonly ActivityPresencePerson[];
}) {
  const t = useTranslations('meet.call.stage_layout');
  if (!people.length) return null;
  const visible = people.slice(0, 3);
  const overflow = people.length - visible.length;
  return (
    <span
      data-activities-dock-presence=""
      aria-label={t('dock_presence_count', { count: people.length })}
      className="hidden items-center -space-x-1.5 md:inline-flex"
    >
      {visible.map((person) => {
        const label = person.activityTitle
          ? `${person.displayName} · ${person.activityTitle}`
          : person.displayName;
        return (
          <Avatar
            key={person.userId}
            className="size-5 border border-background"
            title={label}
            aria-label={label}
          >
            {person.avatarUrl && (
              <AvatarImage src={person.avatarUrl} alt={person.displayName} />
            )}
            <AvatarFallback className="text-[9px] font-medium">
              {Array.from(person.displayName)[0]?.toLocaleUpperCase() ?? '?'}
            </AvatarFallback>
          </Avatar>
        );
      })}
      {overflow > 0 && (
        <span className="grid size-5 place-items-center rounded-full border border-background bg-muted px-1 font-medium text-[9px] text-muted-foreground">
          +{overflow}
        </span>
      )}
    </span>
  );
}
