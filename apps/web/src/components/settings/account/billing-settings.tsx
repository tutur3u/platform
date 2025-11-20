'use client';

import CurrentPlanCard from '@/app/[locale]/(dashboard)/settings/account/billing/current-plan-card';

export default function BillingSettings() {
  return (
    <div className="space-y-8">
      <CurrentPlanCard />
    </div>
  );
}
