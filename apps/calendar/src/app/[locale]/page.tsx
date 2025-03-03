'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar } from '@tuturuuu/ui/legacy/calendar/Calendar';
import { useLocale, useTranslations } from 'next-intl';

export default function Home() {
  const t = useTranslations('calendar');
  const locale = useLocale();

  return (
    <div className="relative flex h-screen flex-col overflow-y-auto p-4 md:p-8 lg:p-16 lg:pb-8">
      <Calendar
        t={t}
        locale={locale}
        useQuery={useQuery}
        useQueryClient={useQueryClient}
        disabled
      />
    </div>
  );
}
