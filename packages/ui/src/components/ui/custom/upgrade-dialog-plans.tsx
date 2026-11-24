'use client';

import { Check, ExternalLink } from '@tuturuuu/icons';
import type {
  UpgradePlan,
  UpgradePlanCycle,
  WorkspaceUpgradeOptions,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@tuturuuu/ui/toggle-group';
import { cn } from '@tuturuuu/utils/format';
import { useLocale, useTranslations } from 'next-intl';
import {
  billingHandoffHref,
  formatCents,
  planUnitPrice,
  plansForCycle,
  simplePlanName,
  tierRank,
} from './upgrade-dialog-format';

export function useUpgradePlanPrice() {
  const t = useTranslations('upgrade_dialog');
  const locale = useLocale();
  return (plan: UpgradePlan, cycle: UpgradePlanCycle) => {
    if (plan.tier === 'FREE') return t('free');
    const price = formatCents(planUnitPrice(plan), locale);
    const seat = plan.pricingModel === 'seat_based';
    if (cycle === 'year') {
      return seat
        ? t('price_per_seat_year', { price })
        : t('price_year', { price });
    }
    return seat
      ? t('price_per_seat_month', { price })
      : t('price_month', { price });
  };
}

export function useUpgradeSeatRange() {
  const t = useTranslations('upgrade_dialog');
  return (plan: UpgradePlan) => {
    const { minSeats, maxSeats } = plan;
    if (plan.pricingModel !== 'seat_based' || !minSeats) return null;
    return maxSeats
      ? t('seats_range', { max: maxSeats, min: minSeats })
      : t('seats_from', { min: minSeats });
  };
}

export function CycleSwitch({
  cycle,
  onChange,
}: {
  cycle: UpgradePlanCycle;
  onChange: (cycle: UpgradePlanCycle) => void;
}) {
  const t = useTranslations('upgrade_dialog');
  return (
    <ToggleGroup
      aria-label={t('billing_cycle')}
      className="w-fit gap-1 rounded-lg border bg-muted/30 p-1"
      onValueChange={(value) => {
        if (value === 'month' || value === 'year') onChange(value);
      }}
      type="single"
      value={cycle}
    >
      <ToggleGroupItem className="px-3" size="sm" value="month">
        {t('cycle_month')}
      </ToggleGroupItem>
      <ToggleGroupItem className="px-3" size="sm" value="year">
        {t('cycle_year')}
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

export function BillingLink({ href }: { href: string }) {
  const t = useTranslations('upgrade_dialog');
  return (
    <Button asChild variant="outline">
      <a href={href} rel="noopener noreferrer" target="_blank">
        {t('view_billing')}
        <ExternalLink className="h-4 w-4" />
      </a>
    </Button>
  );
}

export function PlansPanel({
  cycle,
  data,
  onCycleChange,
}: {
  cycle: UpgradePlanCycle;
  data: WorkspaceUpgradeOptions;
  onCycleChange: (cycle: UpgradePlanCycle) => void;
}) {
  const t = useTranslations('upgrade_dialog');
  const priceOf = useUpgradePlanPrice();
  const seatsOf = useUpgradeSeatRange();
  const plans = plansForCycle(data.plans, cycle);
  const currentRank = tierRank(data.currentPlan?.tier);
  const currentId = data.currentPlan?.productId;

  return (
    <div className="space-y-5">
      <CycleSwitch cycle={cycle} onChange={onCycleChange} />
      <ul className="grid gap-4 sm:grid-cols-2" data-slot="upgrade-plans">
        {plans.map((plan) => {
          const isCurrent = currentId
            ? plan.id === currentId
            : plan.tier === 'FREE';
          const canCheckout =
            plan.tier !== 'FREE' &&
            !isCurrent &&
            tierRank(plan.tier) >= currentRank;
          const seats = seatsOf(plan);
          return (
            <li
              className={cn(
                'flex flex-col gap-4 rounded-xl border bg-card p-5',
                isCurrent && 'border-dynamic-blue/50 bg-dynamic-blue/5'
              )}
              data-current={isCurrent || undefined}
              key={plan.id}
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-lg">
                    {simplePlanName(plan.name)}
                  </h3>
                  {isCurrent && <Badge>{t('current_badge')}</Badge>}
                </div>
                <p className="font-medium text-foreground/90">
                  {priceOf(plan, cycle)}
                </p>
                {seats && (
                  <p className="text-muted-foreground text-sm">{seats}</p>
                )}
              </div>
              {plan.description && (
                <p className="flex gap-2 text-muted-foreground text-sm">
                  <Check
                    aria-hidden
                    className="mt-0.5 h-4 w-4 shrink-0 text-dynamic-green"
                  />
                  {plan.description}
                </p>
              )}
              <div className="mt-auto">
                {canCheckout ? (
                  <Button asChild className="w-full">
                    <a
                      href={billingHandoffHref(data.billingUrl, plan.id)}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {t('continue_to_checkout')}
                      <span className="sr-only">
                        {' '}
                        {simplePlanName(plan.name)}
                      </span>
                      <ExternalLink aria-hidden className="h-4 w-4" />
                    </a>
                  </Button>
                ) : (
                  <Button className="w-full" disabled variant="outline">
                    {isCurrent ? t('your_plan') : t('manage_in_billing')}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-muted-foreground text-sm">{t('checkout_note')}</p>
    </div>
  );
}
