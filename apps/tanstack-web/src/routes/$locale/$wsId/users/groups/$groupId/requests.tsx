import { createFileRoute, notFound } from '@tanstack/react-router';
import { GroupRequestsClient } from '@/components/users/groups/requests/client';
import { requireCurrentUser } from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { resolveWorkspace } from '@/lib/platform/workspace';
import { hasWorkspacePermission } from '@/lib/platform/workspace-permission';

type GroupRequestsData = {
  canApprovePosts: boolean;
  canApproveReports: boolean;
  workspaceId: string;
};

export const Route = createFileRoute(
  '/$locale/$wsId/users/groups/$groupId/requests'
)({
  component: GroupRequestsRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: 'Review group reports and posts awaiting approval.',
      locale,
      title: 'Group Requests',
    });
  },
  loader: async ({ params }): Promise<GroupRequestsData> => {
    // Auth gate FIRST, fail closed.
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/users/groups/${params.groupId}/requests`,
    });

    // Legacy getPermissions() -> notFound() when missing.
    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists) {
      throw notFound();
    }

    // Legacy: notFound unless approve_reports OR approve_posts.
    const [canApproveReports, canApprovePosts] = await Promise.all([
      hasWorkspacePermission({
        data: { wsId: workspace.workspaceId, permission: 'approve_reports' },
      }),
      hasWorkspacePermission({
        data: { wsId: workspace.workspaceId, permission: 'approve_posts' },
      }),
    ]);
    if (!(canApproveReports || canApprovePosts)) {
      throw notFound();
    }

    return {
      canApprovePosts,
      canApproveReports,
      workspaceId: workspace.workspaceId,
    };
  },
});

function GroupRequestsRoutePage() {
  const data = Route.useLoaderData() as GroupRequestsData | undefined;
  const { groupId } = Route.useParams();

  if (!data) {
    throw notFound();
  }

  return (
    <GroupRequestsClient
      wsId={data.workspaceId}
      groupId={groupId}
      canApproveReports={data.canApproveReports}
      canApprovePosts={data.canApprovePosts}
    />
  );
}
