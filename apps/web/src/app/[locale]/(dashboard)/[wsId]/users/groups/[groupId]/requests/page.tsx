import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { GroupRequestsClient } from './client';

export default async function GroupRequestsPage({
  params,
}: {
  params: Promise<{
    locale: string;
    wsId: string;
    groupId: string;
  }>;
}) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId, groupId }) => {
        const permissions = await getPermissions({ wsId });
if (!permissions) notFound();
const { containsPermission } = permissions;
        const canApproveReports = containsPermission('approve_reports');
        const canApprovePosts = containsPermission('approve_posts');

        if (!canApproveReports && !canApprovePosts) {
          notFound();
        }

        return (
          <GroupRequestsClient
            wsId={wsId}
            groupId={groupId}
            canApproveReports={canApproveReports}
            canApprovePosts={canApprovePosts}
          />
        );
      }}
    </WorkspaceWrapper>
  );
}
