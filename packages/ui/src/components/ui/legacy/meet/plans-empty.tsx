'use client';

import { CalendarDays } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';

export function PlansEmpty() {
  const t = useTranslations('meet-together');
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border bg-card px-4 py-10 text-center md:px-5">
      <CalendarDays aria-hidden className="size-6 text-muted-foreground" />
      <p className="font-medium text-sm">{t('no_plans_yet')}</p>
      <p className="max-w-sm text-muted-foreground text-sm">
        {t('no_plans_desc')}
      </p>
    </div>
  );
}
