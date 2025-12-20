'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@tuturuuu/ui/button';
import { SmartCalendar } from '@tuturuuu/ui/legacy/calendar/smart-calendar';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Suspense } from 'react';
import { DEV_MODE } from '@/constants/common';

export default function Home() {
  const t = useTranslations('calendar');
  const locale = useLocale();

  return (
    <div className="relative flex h-screen flex-col overflow-y-auto p-4 pt-16 md:p-8 md:pt-20 md:pb-4 lg:p-16 lg:pt-20 lg:pb-4">
      {DEV_MODE && (
        <Link href="/scheduler">
          <Button>Scheduler</Button>
        </Link>
      )}
      <Suspense>
        <SmartCalendar
          t={t}
          locale={locale}
          useQuery={useQuery}
          useQueryClient={useQueryClient}
          enableHeader={false}
          disabled
        />
      </Suspense>
    </div>
  );
}
