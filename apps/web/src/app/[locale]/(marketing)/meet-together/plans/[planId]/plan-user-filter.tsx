'use client';

import { ShieldCheck } from '@ncthub/ui/icons';
import { Progress } from '@ncthub/ui/progress';
import { Separator } from '@ncthub/ui/separator';
import { useTranslations } from 'next-intl';
import { GUEST_LIMIT } from '@/constants/meet-together';
import { useTimeBlocking } from './time-blocking-provider';

export default function PlanUserFilter({
  users,
  compact = false,
}: {
  users: any[];
  compact?: boolean;
}) {
  const t = useTranslations('meet-together-plan-details');
  const { filteredUserIds, setFilteredUserIds } = useTimeBlocking();
  const guestCount = users.filter((user) => user.is_guest).length;
  const guestProgress = Math.min((guestCount / GUEST_LIMIT) * 100, 100);

  const containerClassName = compact
    ? 'flex w-full flex-col rounded-2xl border border-foreground/10 bg-background/90 p-4 shadow-sm'
    : 'flex w-full flex-col items-center justify-center p-8';

  const headingClassName = compact
    ? 'text-left text-lg font-semibold'
    : 'text-center text-xl font-bold md:text-2xl';

  const descriptionClassName = compact
    ? 'mt-2 mb-4 text-muted-foreground text-sm'
    : 'mt-2 mb-4 opacity-50 md:mb-8';

  const listClassName = compact
    ? 'grid w-full gap-3'
    : 'grid w-full max-w-6xl gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

  const cardClassName = (selected: boolean) =>
    compact
      ? `rounded-xl border p-3 text-left transition-colors ${
          selected
            ? 'border-foreground/30 bg-foreground/15'
            : 'border-foreground/10 bg-foreground/5 hover:bg-foreground/10'
        }`
      : `rounded-lg border p-4 ${
          selected ? 'border-foreground/30 bg-foreground/20' : 'bg-foreground/5'
        }`;

  return (
    <div className={containerClassName}>
      <div className={headingClassName}>{t('plan_users')}</div>
      <div className={descriptionClassName}>{t('select_users_to_filter')}.</div>

      <div
        className={
          compact
            ? 'mb-4 w-full rounded-xl border border-foreground/10 bg-foreground/5 p-3'
            : 'mb-6 w-full max-w-6xl rounded-xl border border-foreground/10 bg-foreground/5 p-4'
        }
      >
        <div className="mb-2 flex items-center justify-between gap-3 font-medium text-sm">
          <span>{t('guest')}</span>
          <span className="text-muted-foreground">
            {guestCount}/{GUEST_LIMIT}
          </span>
        </div>
        <Progress value={guestProgress} className="h-2" />
      </div>

      <div className={listClassName}>
        {users.length > 0 ? (
          users.map((user) => (
            <button
              type="button"
              key={user.id}
              className={cardClassName(filteredUserIds.includes(user.id))}
              onClick={() =>
                setFilteredUserIds((prev) =>
                  prev.includes(user.id)
                    ? prev.filter((id) => id !== user.id)
                    : [...prev, user.id]
                )
              }
            >
              <div
                className={
                  compact
                    ? 'flex items-center justify-between gap-3'
                    : 'flex items-center justify-center gap-1 font-semibold'
                }
              >
                <div>{user.display_name}</div>
                {user.is_guest ? (
                  <div className="rounded bg-foreground px-1 py-0.5 text-background text-sm">
                    {t('guest')}
                  </div>
                ) : (
                  <ShieldCheck size={16} />
                )}
              </div>
              <Separator className="my-2" />
              <div
                className={`w-full rounded bg-foreground/10 p-2 font-semibold lowercase ${
                  compact ? 'text-left text-sm' : 'text-center'
                }`}
              >
                {user.timeblock_count} {t('timeblocks')}
              </div>
            </button>
          ))
        ) : (
          <li className="col-span-full flex w-full items-center justify-center rounded-lg p-4 pt-0 opacity-50">
            {t('no_users_yet')}.
          </li>
        )}
      </div>
    </div>
  );
}
