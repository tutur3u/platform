import { ApprovalsTable } from './approvals-table';
import { ROOT_WORKSPACE_ID } from '@/constants/common';
import { getPermissions } from '@/lib/workspace-helper';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { redirect } from 'next/navigation';

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

  return (
    <>
      <FeatureSummary
        pluralTitle="Education Access Requests"
        description="Review and approve education feature requests from workspace creators. Approved requests will automatically enable education features for the respective workspaces."
      />
      <Separator className="my-4" />
      <ApprovalsTable />
    </>
  );
}
