import AnalyticsPage from '@tuturuuu/ui/finance/analytics/analytics-page';
import {
  getPermissions,
  getWorkspaceConfig,
} from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import WorkspaceWrapper from '@/components/workspace-wrapper';

export const metadata: Metadata = {
  title: 'Analytics',
  description: 'View analytics in the Finance area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceAnalyticsPage({ params }: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const [{ withoutPermission }, currency] = await Promise.all([
          getPermissions({ wsId }),
          getWorkspaceConfig(wsId, 'DEFAULT_CURRENCY'),
        ]);
        if (withoutPermission('view_finance_stats')) notFound();

        return <AnalyticsPage wsId={wsId} currency={currency ?? 'USD'} />;
      }}
    </WorkspaceWrapper>
  );
}
