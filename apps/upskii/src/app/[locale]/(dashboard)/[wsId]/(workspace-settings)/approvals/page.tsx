import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ApprovalsTable } from './approvals-table';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function ApprovalsPage({ params }: Props) {
  const { wsId } = await params;

  // Only allow root workspace access to approvals
  if (wsId !== ROOT_WORKSPACE_ID) {
    redirect(`/${wsId}/settings`);
  }

  const { withoutPermission } = await getPermissions({
    wsId,
  });

  // Check if user has permission to view infrastructure
  if (withoutPermission('view_infrastructure')) {
    redirect(`/${wsId}/settings`);
  }

  const t = await getTranslations('approvals');

  return (
    <>
      <FeatureSummary
        pluralTitle={t('feature-access-requests')}
        description={t('feature-access-requests-description')}
      />
      <Separator className="my-4" />
      <ApprovalsTable />
    </>
  );
}
