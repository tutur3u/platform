import CurrentPlanCard from './current-plan-card';
import PaymentBillingCard from './payment-billing-card';

export default async function BillingPage() {
  return (
    <div className="space-y-6">
      <CurrentPlanCard />
      <PaymentBillingCard />
    </div>
  );
}
