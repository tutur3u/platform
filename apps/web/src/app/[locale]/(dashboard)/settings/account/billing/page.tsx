import { CurrentPlanCard, PaymentBillingCard } from '../components';

export default async function BillingPage() {
  return (
    <div className="space-y-6">
      <CurrentPlanCard />
      <PaymentBillingCard />
    </div>
  );
}
