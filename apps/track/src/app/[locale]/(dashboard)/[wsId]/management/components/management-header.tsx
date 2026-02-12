'use client';

import { Clock } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';

export default function ManagementHeader() {
  const t = useTranslations('time-tracker.management.header');

  return (
    <div className="space-y-6 rounded-xl border border-dynamic-border/20 bg-linear-to-r from-dynamic-blue/5 via-dynamic-purple/5 to-dynamic-green/5 p-8">
      <div className="flex items-center justify-between">
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <div className="rounded-lg bg-linear-to-br from-dynamic-blue/20 to-dynamic-purple/20 p-3 ring-2 ring-dynamic-blue/10">
              <Clock className="size-8 text-dynamic-blue" />
            </div>
            <div>
              <h1 className="bg-linear-to-r from-dynamic-blue to-dynamic-purple bg-clip-text font-bold text-3xl text-transparent">
                {t('title')}
              </h1>
              <p className="mt-1 text-base text-dynamic-muted">
                {t('description')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
