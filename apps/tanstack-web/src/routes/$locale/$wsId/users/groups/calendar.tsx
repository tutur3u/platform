import { createFileRoute, notFound } from '@tanstack/react-router';
import { UserGroupSessionCalendar } from '@/components/users/groups/user-group-session-calendar';
import { requireCurrentUser } from '../../../../../lib/platform/auth-gate';
import { createPageHead } from '../../../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../../../lib/platform/messages';
import { resolveWorkspace } from '../../../../../lib/platform/workspace';
import { hasWorkspacePermission } from '../../../../../lib/platform/workspace-permission';

type GroupCalendarLoaderData = {
  canUpdateSchedule: boolean;
  workspaceId: string;
};

export const Route = createFileRoute('/$locale/$wsId/users/groups/calendar')({
  component: GroupCalendarRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: 'Manage all user group sessions in a workspace calendar.',
      locale,
      title: 'Group Calendar',
    });
  },
  loader: async ({ params }): Promise<GroupCalendarLoaderData> => {
    // Auth gate FIRST, fail closed.
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/users/groups/calendar`,
    });

    // Legacy getPermissions() -> notFound() when missing.
    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists) {
      throw notFound();
    }

    // Legacy: notFound unless manage_users OR view_user_groups.
    const [canManageUsers, canViewGroups] = await Promise.all([
      hasWorkspacePermission({
        data: { wsId: workspace.workspaceId, permission: 'manage_users' },
      }),
      hasWorkspacePermission({
        data: { wsId: workspace.workspaceId, permission: 'view_user_groups' },
      }),
    ]);
    if (!(canManageUsers || canViewGroups)) {
      throw notFound();
    }

    // canUpdateSchedule gates inline editing in the calendar component.
    const canUpdateSchedule = await hasWorkspacePermission({
      data: { wsId: workspace.workspaceId, permission: 'update_user_groups' },
    });

    return { canUpdateSchedule, workspaceId: workspace.workspaceId };
  },
});

function GroupCalendarRoutePage() {
  const data = Route.useLoaderData() as GroupCalendarLoaderData | undefined;

  if (!data) {
    throw notFound();
  }

  return (
    <UserGroupSessionCalendar
      canChooseGroup
      canUpdateSchedule={data.canUpdateSchedule}
      wsId={data.workspaceId}
    />
  );
}
