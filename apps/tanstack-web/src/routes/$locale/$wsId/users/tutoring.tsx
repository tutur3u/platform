import { createFileRoute, notFound } from '@tanstack/react-router';
import { TutoringClient } from '../../../../components/tutoring/tutoring-client';
import { requireCurrentUser } from '../../../../lib/platform/auth-gate';
import { createPageHead } from '../../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../../lib/platform/messages';
import { resolveFullWorkspace } from '../../../../lib/platform/workspace';
import { hasWorkspacePermission } from '../../../../lib/platform/workspace-permission';

type TutoringLoaderData = {
  canManage: boolean;
  workspaceId: string;
};

export const Route = createFileRoute('/$locale/$wsId/users/tutoring')({
  component: TutoringRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: 'Manage tutoring and remedial sessions.',
      locale,
      title: 'Tutoring',
    });
  },
  loader: async ({ params }): Promise<TutoringLoaderData> => {
    // Auth gate FIRST, fail closed.
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/users/tutoring`,
    });

    // Legacy getWorkspace() -> notFound() when missing/forbidden.
    const workspace = await resolveFullWorkspace({
      data: { wsId: params.wsId },
    });
    if (!workspace.exists) {
      throw notFound();
    }

    // Legacy: personal workspaces have no tutoring page -> notFound().
    if (workspace.workspace.personal) {
      throw notFound();
    }

    // Legacy: withoutPermission('view_user_groups') -> notFound().
    const canView = await hasWorkspacePermission({
      data: {
        wsId: workspace.workspace.id,
        permission: 'view_user_groups',
      },
    });
    if (!canView) {
      throw notFound();
    }

    const canManage = await hasWorkspacePermission({
      data: {
        wsId: workspace.workspace.id,
        permission: 'update_user_groups_scores',
      },
    });

    return {
      canManage,
      workspaceId: workspace.workspace.id,
    };
  },
});

function TutoringRoutePage() {
  const data = Route.useLoaderData() as TutoringLoaderData | undefined;

  if (!data) {
    throw notFound();
  }

  return <TutoringClient wsId={data.workspaceId} canManage={data.canManage} />;
}
