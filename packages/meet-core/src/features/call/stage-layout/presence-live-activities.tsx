'use client';

import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { type ComponentType, useId } from 'react';
import {
  type ActivityPresencePerson,
  ActivityPresenceRow,
} from './activity-presence';
import { activityTone } from './activity-tones';

export interface PresenceLiveActivity {
  id: string;
  title: string;
  description?: string;
  icon: ComponentType<{ className?: string }>;
  participants: readonly ActivityPresencePerson[];
  isOpen: boolean;
  isHostDefault?: boolean;
  canOpen: boolean;
  onOpen: () => void;
}

/**
 * Responsive "Live now" highlight grid for presence-only rooms. Surfaces
 * active and host-enabled activities with live participant avatars, semantic
 * tones, and one-tap join/open actions when permitted.
 */
export function PresenceLiveActivities({
  activities,
}: {
  activities: readonly PresenceLiveActivity[];
}) {
  const t = useTranslations('meet.call.presence_roster');
  const headingId = useId();
  if (!activities.length) return null;

  return (
    <section
      data-testid="presence-live-activities"
      aria-labelledby={headingId}
      className="flex w-full max-w-3xl flex-col gap-3"
    >
      <div className="flex items-center justify-center gap-2">
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-full bg-dynamic-green"
        />
        <h2
          id={headingId}
          className="font-semibold text-foreground text-sm tracking-tight"
        >
          {t('live_now')}
        </h2>
        <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground text-xs">
          {activities.length}
        </span>
      </div>
      <ul
        className={cn(
          'grid w-full grid-cols-1 gap-3',
          activities.length === 1 ? 'mx-auto max-w-md' : 'sm:grid-cols-2'
        )}
      >
        {activities.map((activity) => {
          const Icon = activity.icon;
          const actionLabel = t(activity.isOpen ? 'live_open' : 'live_join');
          const actionAriaLabel = t(
            activity.isOpen ? 'live_open_named' : 'live_join_named',
            { name: activity.title }
          );
          return (
            <li
              key={activity.id}
              data-live-activity={activity.id}
              className={cn(
                'flex min-w-0 flex-col justify-between gap-3 rounded-xl border bg-background/80 p-3.5 text-left transition-colors sm:p-4',
                activity.canOpen && 'hover:border-foreground/20'
              )}
            >
              <div className="flex min-w-0 items-start gap-3">
                <span
                  data-live-activity-tone={activity.id}
                  className={cn(
                    'grid size-10 shrink-0 place-items-center rounded-lg',
                    activityTone(activity.id)
                  )}
                >
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <p className="truncate font-semibold text-foreground text-sm">
                    {activity.title}
                  </p>
                  {activity.description && (
                    <p className="line-clamp-1 text-muted-foreground text-xs">
                      {activity.description}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex min-w-0 items-center justify-between gap-2 pt-0.5">
                {activity.participants.length > 0 ? (
                  <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                    <ActivityPresenceRow
                      activityId={activity.id}
                      people={activity.participants}
                      compact
                    />
                    <span
                      data-live-activity-count={activity.id}
                      className="min-w-0 truncate font-medium text-muted-foreground text-xs"
                    >
                      {t('live_participants', {
                        count: activity.participants.length,
                      })}
                    </span>
                  </div>
                ) : activity.isOpen ? (
                  <span className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
                    <span
                      aria-hidden="true"
                      className="size-1.5 shrink-0 rounded-full bg-foreground/60"
                    />
                    <span className="truncate">{t('live_open_on_stage')}</span>
                  </span>
                ) : activity.isHostDefault ? (
                  <span className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
                    <span
                      aria-hidden="true"
                      className="size-1.5 shrink-0 rounded-full bg-dynamic-green"
                    />
                    <span className="truncate">{t('live_ready')}</span>
                  </span>
                ) : (
                  <span />
                )}
                {activity.canOpen && (
                  <Button
                    type="button"
                    size="sm"
                    variant={activity.isOpen ? 'outline' : 'default'}
                    className="h-10 shrink-0 rounded-full px-4 sm:h-9 sm:px-3.5"
                    aria-label={actionAriaLabel}
                    onClick={activity.onOpen}
                  >
                    {actionLabel}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
