import { createFileRoute, notFound, redirect } from '@tanstack/react-router';
import {
  StandardWorkspaceAccessPage,
  type WorkspaceAccessTab,
} from '@tuturuuu/ui/custom/workspace-access';
import { requireCurrentUser } from '../../../lib/platform/auth-gate';
import { createPageHead } from '../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../lib/platform/messages';
import { resolveFullWorkspace } from '../../../lib/platform/workspace';
import { hasWorkspacePermission } from '../../../lib/platform/workspace-permission';

const WORKSPACE_ACCESS_TABS: WorkspaceAccessTab[] = [
  'people',
  'roles',
  'defaults-member',
  'defaults-guest',
];

type MembersSearch = { tab?: WorkspaceAccessTab };

type MembersLoaderData = {
  canManageMembers: boolean;
  canManageRoles: boolean;
  currentUserEmail: string | null;
  workspaceId: string;
};

function resolveInitialTab(tab: string | undefined): WorkspaceAccessTab {
  return WORKSPACE_ACCESS_TABS.includes(tab as WorkspaceAccessTab)
    ? (tab as WorkspaceAccessTab)
    : 'people';
}

export const Route = createFileRoute('/$locale/$wsId/members')({
  component: MembersRoutePage,
  validateSearch: (search: Record<string, unknown>): MembersSearch => ({
    tab:
      typeof search.tab === 'string'
        ? (search.tab as WorkspaceAccessTab)
        : undefined,
  }),
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: 'Manage Members in your Tuturuuu workspace settings.',
      locale,
      title: 'Members',
    });
  },
  loader: async ({ params }): Promise<MembersLoaderData> => {
    // Auth gate FIRST, fail closed. The profile supplies currentUserEmail.
    const user = await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/members`,
    });

    // Legacy getWorkspace() -> notFound() when missing/forbidden.
    const workspace = await resolveFullWorkspace({
      data: { wsId: params.wsId },
    });
    if (!workspace.exists) {
      throw notFound();
    }

    const settingsHref = `/${params.locale}/${params.wsId}/settings`;

    // Legacy: personal workspaces have no members page -> redirect to settings.
    if (workspace.workspace.personal) {
      throw redirect({ href: settingsHref, statusCode: 307 });
    }

    // Legacy: withoutPermission('manage_workspace_members') -> redirect(settings).
    const canManageMembers = await hasWorkspacePermission({
      data: {
        wsId: workspace.workspace.id,
        permission: 'manage_workspace_members',
      },
    });
    if (!canManageMembers) {
      throw redirect({ href: settingsHref, statusCode: 307 });
    }

    const canManageRoles = await hasWorkspacePermission({
      data: {
        wsId: workspace.workspace.id,
        permission: 'manage_workspace_roles',
      },
    });

    return {
      canManageMembers,
      canManageRoles,
      currentUserEmail: user.email ?? null,
      workspaceId: workspace.workspace.id,
    };
  },
});

function MembersRoutePage() {
  const data = Route.useLoaderData() as MembersLoaderData | undefined;
  const { tab } = Route.useSearch();

  if (!data) {
    throw notFound();
  }

  return (
    <StandardWorkspaceAccessPage
      // `disableInvite` comes from verifyHasSecrets(['DISABLE_INVITE']) in
      // legacy; there is no forwarded-auth secrets reader yet, so default false
      // (Phase-2 — invite stays enabled until a reader lands). The component
      // self-loads the rest of its access context via its adapter, using
      // initialContext only as TanStack Query seed data.
      disableInvite={false}
      initialContext={{
        canManageMembers: data.canManageMembers,
        canManageRoles: data.canManageRoles,
        currentUserEmail: data.currentUserEmail,
        workspaceId: data.workspaceId,
      }}
      initialTab={resolveInitialTab(tab)}
    />
  );
}
