'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SmartCalendar } from '@tuturuuu/ui/legacy/calendar/smart-calendar';
import { useLocale, useTranslations } from 'next-intl';

export default function Home() {
  const t = useTranslations('calendar');
  const locale = useLocale();
  // const { date, setDate, view, setView, availableViews } = useCalendarContext();

  return (
    <div className="relative flex h-screen flex-col overflow-y-auto p-4 pt-16 md:p-8 md:pb-4 md:pt-20 lg:p-16 lg:pb-4 lg:pt-20">
      <SmartCalendar
        t={t}
        locale={locale}
        useQuery={useQuery}
        useQueryClient={useQueryClient}
        enableHeader={false}
        disabled
      />
    </div>
  );
}
