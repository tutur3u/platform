import type { Metadata } from 'next';
import CurrentPlanCard from './current-plan-card';
import PaymentBillingCard from './payment-billing-card';

export const metadata: Metadata = {
  title: 'Billing',
  description: 'Manage Billing in the Account area of your Tuturuuu workspace.',
};

export default async function BillingPage() {
  return (
    <div className="space-y-6">
      <CurrentPlanCard />
      <PaymentBillingCard />
    </div>
  );
}
