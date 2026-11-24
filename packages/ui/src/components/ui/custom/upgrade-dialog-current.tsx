'use client';

import type { WorkspaceUpgradeOptions } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { useLocale, useTranslations } from 'next-intl';
import { simplePlanName } from './upgrade-dialog-format';

export function CurrentPlanPanel({ data }: { data: WorkspaceUpgradeOptions }) {
  const t = useTranslations('upgrade_dialog');
  const locale = useLocale();
  const plan = data.currentPlan;

  if (!plan) {
    return (
      <section
        aria-labelledby="upgrade-current-plan"
        className="space-y-1 rounded-xl border bg-card p-5"
      >
        <h3 className="font-semibold text-lg" id="upgrade-current-plan">
          {t('free_plan_name')}
        </h3>
        <p className="text-muted-foreground text-sm">{t('free_plan_body')}</p>
      </section>
    );
  }

  const date = plan.currentPeriodEnd
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
        new Date(plan.currentPeriodEnd)
      )
    : null;
  const rows: Array<[string, string]> = [
    [
      t('current_cycle'),
      plan.billingCycle === 'year'
        ? t('cycle_year')
        : plan.billingCycle === 'month'
          ? t('cycle_month')
          : t('not_applicable'),
    ],
    [
      t('compare_seats'),
      plan.seatCount ? String(plan.seatCount) : t('not_applicable'),
    ],
    [
      plan.cancelAtPeriodEnd ? t('current_ends') : t('current_renews'),
      date ?? t('not_applicable'),
    ],
  ];

  return (
    <section
      aria-labelledby="upgrade-current-plan"
      className="space-y-4 rounded-xl border bg-card p-5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-lg" id="upgrade-current-plan">
          {simplePlanName(plan.name)}
        </h3>
        <Badge variant={plan.cancelAtPeriodEnd ? 'warning' : 'success'}>
          {plan.cancelAtPeriodEnd ? t('status_canceling') : t('status_active')}
        </Badge>
      </div>
      <dl className="divide-y text-sm">
        {rows.map(([label, value]) => (
          <div className="flex justify-between gap-4 py-2" key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
