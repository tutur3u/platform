import { createFileRoute, notFound } from '@tanstack/react-router';
import { UserFeedbacksClient } from '../../../../components/users/feedbacks/user-feedbacks-client';
import { requireCurrentUser } from '../../../../lib/platform/auth-gate';
import { createPageHead } from '../../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../../lib/platform/messages';
import { resolveFullWorkspace } from '../../../../lib/platform/workspace';
import { hasWorkspacePermission } from '../../../../lib/platform/workspace-permission';

type UserFeedbacksLoaderData = {
  canManageFeedbacks: boolean;
  workspaceId: string;
};

export const Route = createFileRoute('/$locale/$wsId/users/feedbacks')({
  component: UserFeedbacksRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: 'Review and manage workspace user feedbacks.',
      locale,
      title: 'User Feedbacks',
    });
  },
  loader: async ({ params }): Promise<UserFeedbacksLoaderData> => {
    // Auth gate FIRST, fail closed.
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/users/feedbacks`,
    });

    // Legacy getWorkspace() -> notFound() when missing/forbidden.
    const workspace = await resolveFullWorkspace({
      data: { wsId: params.wsId },
    });
    if (!workspace.exists) {
      throw notFound();
    }

    // Legacy: personal workspaces have no feedbacks page -> notFound().
    if (workspace.workspace.personal) {
      throw notFound();
    }

    // Legacy: withoutPermission('view_user_groups') -> notFound().
    const canViewFeedbacks = await hasWorkspacePermission({
      data: {
        wsId: workspace.workspace.id,
        permission: 'view_user_groups',
      },
    });
    if (!canViewFeedbacks) {
      throw notFound();
    }

    const canManageFeedbacks = await hasWorkspacePermission({
      data: {
        wsId: workspace.workspace.id,
        permission: 'update_user_groups_scores',
      },
    });

    return {
      canManageFeedbacks,
      workspaceId: workspace.workspace.id,
    };
  },
});

function UserFeedbacksRoutePage() {
  const data = Route.useLoaderData() as UserFeedbacksLoaderData | undefined;

  if (!data) {
    throw notFound();
  }

  return (
    <UserFeedbacksClient
      wsId={data.workspaceId}
      canManageFeedbacks={data.canManageFeedbacks}
    />
  );
}
