import { createFileRoute, notFound, Outlet } from '@tanstack/react-router';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import {
  getWorkspaceNextPath,
  requireCurrentUser,
} from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { resolveWorkspace } from '@/lib/platform/workspace';
import { hasWorkspacePermission } from '@/lib/platform/workspace-permission';

function isExactInfrastructurePath({
  locale,
  pathname,
  wsId,
}: {
  locale: string;
  pathname: string;
  wsId: string;
}) {
  const infrastructurePath = `/${locale}/${wsId}/infrastructure`;

  return (
    pathname === infrastructurePath || pathname === `${infrastructurePath}/`
  );
}

export const Route = createFileRoute('/$locale/$wsId/infrastructure')({
  component: InfrastructureLayout,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Manage Infrastructure in the Workspace Settings area of your Tuturuuu workspace.',
      locale,
      title: 'Infrastructure',
    });
  },
  loader: async ({ location, params }): Promise<void> => {
    await requireCurrentUser({
      locale: params.locale,
      nextPath: getWorkspaceNextPath(
        params,
        location.pathname,
        'infrastructure'
      ),
    });

    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists) {
      throw notFound();
    }

    const canViewInfrastructure = await hasWorkspacePermission({
      data: {
        permission: 'view_infrastructure',
        wsId: ROOT_WORKSPACE_ID,
      },
    });
    if (!canViewInfrastructure) {
      throw notFound();
    }

    if (
      isExactInfrastructurePath({
        locale: params.locale,
        pathname: location.pathname,
        wsId: params.wsId,
      })
    ) {
      throw notFound();
    }
  },
});

function InfrastructureLayout() {
  return <Outlet />;
}
