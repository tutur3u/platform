'use client';

import { ShieldCheck } from '@tuturuuu/icons';
import type { PlanUser } from '@tuturuuu/types/primitives/MeetTogetherPlan';
import { useTimeBlocking } from '@tuturuuu/ui/hooks/time-blocking-provider';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'next-intl';

export default function PlanUserFilter({ users }: { users: PlanUser[] }) {
  const t = useTranslations('meet-together-plan-details');
  const { filteredUserIds, setFilteredUserIds } = useTimeBlocking();

  return (
    <div className="flex w-full flex-col items-center justify-center p-8">
      <div className="text-center font-bold text-xl md:text-2xl">
        {t('plan_users')}
      </div>
      <div className="mt-2 mb-4 opacity-50 md:mb-8">
        {t('select_users_to_filter')}.
      </div>

      <div className="grid w-full max-w-6xl gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {users.length > 0 ? (
          users.map((user) => (
            <button
              type="button"
              key={user.id}
              className={`rounded-lg border p-4 ${
                filteredUserIds.includes(user.id || '')
                  ? 'border-foreground/30 bg-foreground/20'
                  : 'bg-foreground/5'
              }`}
              onClick={() =>
                setFilteredUserIds((prev) =>
                  prev.includes(user.id || '')
                    ? prev.filter((id) => id !== user.id)
                    : [...prev, user.id || '']
                )
              }
            >
              <div className="flex items-center justify-center gap-1 font-semibold">
                <div>{user.display_name}</div>
                {user.is_guest ? (
                  <>
                    <br />
                    <div className="rounded bg-foreground px-1 py-0.5 text-background text-sm">
                      {t('guest')}
                    </div>
                  </>
                ) : (
                  <ShieldCheck size={16} />
                )}
              </div>
              <Separator className="my-2" />
              <div className="w-full rounded bg-foreground/10 p-2 text-center font-semibold lowercase">
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
