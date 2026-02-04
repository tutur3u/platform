'use client';

import CurrentPlanCard from '@/app/[locale]/(dashboard)/settings/account/billing/current-plan-card';
import PaymentBillingCard from '@/app/[locale]/(dashboard)/settings/account/billing/payment-billing-card';

export default function BillingSettings() {
  return (
    <div className="space-y-6">
      <CurrentPlanCard />
      <PaymentBillingCard />
    </div>
  );
}
