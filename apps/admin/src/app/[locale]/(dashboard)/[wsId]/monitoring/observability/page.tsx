import { ProviderInvoiceSummary } from './provider-invoice-summary';
import { ObservabilityDashboardClient } from '../_components/observability-dashboard-client';

export default function InfrastructureMonitoringObservabilityPage() {
  return (
    <div className="space-y-6">
      <ObservabilityDashboardClient mode="observability" />
      <ProviderInvoiceSummary />
    </div>
  );
}
