import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import {
  listWorkspaceUserGroupsByIds,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import EditEndDateDialog from '@/components/users/groups/edit-end-date-dialog';
import { UserGroupSessionCalendar } from '@/components/users/groups/user-group-session-calendar';
import { requireCurrentUser } from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { resolveWorkspace } from '@/lib/platform/workspace';
import { hasWorkspacePermission } from '@/lib/platform/workspace-permission';

type GroupScheduleData = {
  canUpdateSchedule: boolean;
  workspaceId: string;
  group: {
    id: string;
    name: string | null;
    starting_date: string | null;
    ending_date: string | null;
  };
};

// Forwarded-auth read of the target group (id/name/dates) — mirrors the legacy
// page's `createClient().from('workspace_user_groups')` maybeSingle select,
// routed through the existing list-by-ids facade (RLS-respecting).
const loadUserGroup = createServerFn({ method: 'GET' })
  .validator((data: { wsId: string; groupId: string }) => data)
  .handler(async ({ data }): Promise<GroupScheduleData['group'] | null> => {
    try {
      const groups = await listWorkspaceUserGroupsByIds(
        data.wsId,
        [data.groupId],
        withForwardedInternalApiAuth(getRequestHeaders())
      );

      const group = groups.find((entry) => entry.id === data.groupId);
      if (!group) {
        return null;
      }

      return {
        id: group.id,
        name: group.name ?? null,
        starting_date: group.starting_date ?? null,
        ending_date: group.ending_date ?? null,
      };
    } catch {
      return null;
    }
  });

export const Route = createFileRoute(
  '/$locale/$wsId/users/groups/$groupId/schedule'
)({
  component: GroupScheduleRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Manage Schedule in the Group area of your Tuturuuu workspace.',
      locale,
      title: 'Schedule',
    });
  },
  loader: async ({ params }): Promise<GroupScheduleData> => {
    // Auth gate FIRST, fail closed.
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/users/groups/${params.groupId}/schedule`,
    });

    // Legacy getPermissions() -> notFound() when missing.
    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists) {
      throw notFound();
    }

    // Legacy getData() -> notFound() when the group is missing.
    const group = await loadUserGroup({
      data: { wsId: workspace.workspaceId, groupId: params.groupId },
    });
    if (!group) {
      throw notFound();
    }

    const canUpdateSchedule = await hasWorkspacePermission({
      data: { wsId: workspace.workspaceId, permission: 'update_user_groups' },
    });

    return {
      canUpdateSchedule,
      group,
      workspaceId: workspace.workspaceId,
    };
  },
});

function GroupScheduleRoutePage() {
  const data = Route.useLoaderData() as GroupScheduleData | undefined;
  const { groupId } = Route.useParams();

  if (!data) {
    throw notFound();
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <EditEndDateDialog
          wsId={data.workspaceId}
          groupId={groupId}
          currentStartDate={data.group.starting_date}
          currentEndDate={data.group.ending_date}
        />
      </div>
      <UserGroupSessionCalendar
        wsId={data.workspaceId}
        groupId={groupId}
        canUpdateSchedule={data.canUpdateSchedule}
        title={data.group.name ?? undefined}
      />
    </>
  );
}
