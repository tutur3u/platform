import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import {
  type BackendInfrastructurePostEmailQueueResponse,
  getBackendInfrastructurePostEmailQueue,
  withForwardedBackendApiAuth,
} from '@tuturuuu/internal-api/backend';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { PostEmailQueueClientPage } from '@/components/infrastructure/post-email-queue/post-email-queue-client-page';
import { withTanstackBackendRuntime } from '@/lib/cloudflare/backend';
import { requireCurrentUser } from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { resolveWorkspace } from '@/lib/platform/workspace';
import { hasWorkspacePermission } from '@/lib/platform/workspace-permission';

type PostEmailQueueData = BackendInfrastructurePostEmailQueueResponse;

const loadPostEmailQueue = createServerFn({ method: 'GET' }).handler(
  async (): Promise<BackendInfrastructurePostEmailQueueResponse> => {
    const backendRuntime = await withTanstackBackendRuntime();

    return getBackendInfrastructurePostEmailQueue(
      withForwardedBackendApiAuth(getRequestHeaders(), backendRuntime)
    );
  }
);

export const Route = createFileRoute(
  '/$locale/$wsId/infrastructure/post-email-queue'
)({
  component: PostEmailQueueRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Platform-wide observability for the post email queue system.',
      locale,
      title: 'Post Email Queue',
    });
  },
  loader: async ({ params }): Promise<PostEmailQueueData> => {
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/infrastructure/post-email-queue`,
    });

    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists) {
      throw notFound();
    }

    const [canViewRootInfrastructure, canViewWorkspaceInfrastructure] =
      await Promise.all([
        hasWorkspacePermission({
          data: {
            permission: 'view_infrastructure',
            wsId: ROOT_WORKSPACE_ID,
          },
        }),
        hasWorkspacePermission({
          data: {
            permission: 'view_infrastructure',
            wsId: workspace.workspaceId,
          },
        }),
      ]);
    if (!canViewRootInfrastructure || !canViewWorkspaceInfrastructure) {
      throw notFound();
    }

    return loadPostEmailQueue();
  },
});

function PostEmailQueueRoutePage() {
  const data = Route.useLoaderData() as PostEmailQueueData | undefined;

  if (!data) {
    throw notFound();
  }

  return (
    <PostEmailQueueClientPage
      byWorkspace={data.byWorkspace}
      recentBatches={data.recentBatches}
      summary={data.summary}
    />
  );
}
