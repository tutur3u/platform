import type { Metadata } from 'next';
import { WorkspaceBillingSummaryPanel } from '@/components/settings/workspace/billing-summary-panel';
import WorkspaceWrapper from '@/components/workspace-wrapper';

export const metadata: Metadata = {
  description: 'View the billing summary for your Tuturuuu workspace.',
  title: 'Billing',
};

export default function BillingPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => (
        <div className="container mx-auto max-w-4xl px-4 py-8">
          <WorkspaceBillingSummaryPanel wsId={wsId} />
        </div>
      )}
    </WorkspaceWrapper>
  );
}
