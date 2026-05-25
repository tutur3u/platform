'use client';

import { useTranslations } from 'next-intl';

export function DashboardHeader() {
  const t = useTranslations('transaction-data-table');

  return (
    <div className="mb-4">
      <h2 className="font-bold text-2xl text-foreground tracking-tight">
        {t('financial_overview') || 'Financial Overview'}
      </h2>
      <p className="mt-1 text-muted-foreground text-sm">
        {t('financial_overview_description') ||
          'Track your income, expenses, and overall financial health'}
      </p>
    </div>
  );
}
