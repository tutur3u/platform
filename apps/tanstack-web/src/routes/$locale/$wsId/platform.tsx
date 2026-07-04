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

function isExactPlatformPath({
  locale,
  pathname,
  wsId,
}: {
  locale: string;
  pathname: string;
  wsId: string;
}) {
  const platformPath = `/${locale}/${wsId}/platform`;

  return pathname === platformPath || pathname === `${platformPath}/`;
}

export const Route = createFileRoute('/$locale/$wsId/platform')({
  component: PlatformLayout,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Manage Platform settings in the Workspace Settings area of your Tuturuuu workspace.',
      locale,
      title: 'Platform Settings',
    });
  },
  loader: async ({ location, params }): Promise<void> => {
    await requireCurrentUser({
      locale: params.locale,
      nextPath: getWorkspaceNextPath(params, location.pathname, 'platform'),
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
      isExactPlatformPath({
        locale: params.locale,
        pathname: location.pathname,
        wsId: params.wsId,
      })
    ) {
      throw notFound();
    }
  },
});

function PlatformLayout() {
  return <Outlet />;
}
