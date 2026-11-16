'use client';

import { Check } from '@tuturuuu/icons/lucide';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { DashboardTaskRow } from './dashboard-model';

/** One task: a complete control, then the task link with its due state. */
export function TaskRow({
  row,
  pending,
  onComplete,
}: {
  row: DashboardTaskRow;
  pending: boolean;
  onComplete: () => void;
}) {
  const t = useTranslations('dashboard.overview');
  const body = (
    <>
      <span className="min-w-0 flex-1 truncate">{row.name}</span>
      {row.context ? (
        <span className="hidden max-w-[40%] shrink truncate text-muted-foreground text-xs @min-[26rem]/card:inline">
          {row.context}
        </span>
      ) : null}
      {row.group === 'overdue' && row.daysLate > 0 ? (
        <span className="shrink-0 whitespace-nowrap rounded-full border border-dynamic-red/35 px-2 text-dynamic-red text-xs">
          {t('days_late', { count: row.daysLate })}
        </span>
      ) : row.group === 'today' ? (
        <span className="shrink-0 whitespace-nowrap rounded-full border border-dynamic-orange/35 px-2 text-dynamic-orange text-xs">
          {t('group_today')}
        </span>
      ) : null}
    </>
  );
  const bodyClass =
    'flex min-h-10 min-w-0 flex-1 items-center gap-3 rounded-md px-1 text-sm';

  return (
    <li className="-mx-1 flex min-w-0 items-center gap-1 rounded-md hover:bg-muted/60">
      {row.completable ? (
        <button
          type="button"
          onClick={onComplete}
          disabled={pending}
          aria-label={t('complete_task', { name: row.name })}
          className="group grid size-8 shrink-0 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
        >
          <span className="grid size-4 place-items-center rounded-full border-[1.5px] border-muted-foreground group-hover:border-foreground">
            <Check
              aria-hidden
              className={cn(
                'size-2.5 stroke-[3]',
                pending ? 'opacity-100' : 'opacity-0 group-hover:opacity-70'
              )}
            />
          </span>
        </button>
      ) : (
        <span aria-hidden className="size-8 shrink-0" />
      )}
      {row.href ? (
        <a
          href={row.href}
          title={row.name}
          className={cn(
            bodyClass,
            'focus-visible:outline-2 focus-visible:outline-ring'
          )}
        >
          {body}
        </a>
      ) : (
        <div className={bodyClass} title={row.name}>
          {body}
        </div>
      )}
    </li>
  );
}
