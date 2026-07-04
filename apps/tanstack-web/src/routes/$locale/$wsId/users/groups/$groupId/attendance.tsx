import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import {
  getWorkspaceUserGroupAttendanceShowManagers,
  listWorkspaceUserGroupAttendance,
  listWorkspaceUserGroupAttendanceMembers,
  listWorkspaceUserGroupSessions,
  listWorkspaceUserGroupsByIds,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import {
  findValidAttendanceSessionId,
  getAttendanceSessionRange,
  resolveAttendanceDate,
  toAttendanceMap,
} from '@/components/users/groups/attendance/attendance-utils';
import { GroupAttendanceClient } from '@/components/users/groups/attendance/client';
import type {
  AttendanceMember,
  AttendanceSession,
} from '@/components/users/groups/attendance/types';
import { requireCurrentUser } from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { resolveWorkspace } from '@/lib/platform/workspace';
import { hasWorkspacePermission } from '@/lib/platform/workspace-permission';

type AttendanceSearch = {
  date?: string;
  session?: string;
};

type GroupAttendanceData = {
  canUpdateAttendance: boolean;
  group: {
    ending_date: string | null;
    id: string;
    name: string | null;
    starting_date: string | null;
  };
  initialAttendance: ReturnType<typeof toAttendanceMap>;
  initialDate: string;
  initialMembers: AttendanceMember[];
  initialSessionId: string | null;
  initialSessions: AttendanceSession[];
  initialShowManagers: boolean;
  workspaceId: string;
};

type GroupAttendanceServerData = Omit<
  GroupAttendanceData,
  'canUpdateAttendance' | 'workspaceId'
>;

function getSearchString(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

const loadGroupAttendanceData = createServerFn({ method: 'GET' })
  .validator(
    (data: {
      date: string;
      groupId: string;
      requestedSessionId?: string | null;
      wsId: string;
    }) => data
  )
  .handler(async ({ data }): Promise<GroupAttendanceServerData | null> => {
    const authOptions = withForwardedInternalApiAuth(getRequestHeaders());
    const sessionRange = getAttendanceSessionRange(data.date);
    const groups = await listWorkspaceUserGroupsByIds(
      data.wsId,
      [data.groupId],
      authOptions
    );
    const group = groups.find((entry) => entry.id === data.groupId);

    if (!group) {
      return null;
    }

    const [sessionsResponse, membersResponse, showManagers] = await Promise.all(
      [
        listWorkspaceUserGroupSessions(
          data.wsId,
          {
            from: sessionRange.from,
            groupId: data.groupId,
            to: sessionRange.to,
          },
          authOptions
        ),
        listWorkspaceUserGroupAttendanceMembers(
          data.wsId,
          data.groupId,
          { limit: 1000, offset: 0 },
          authOptions
        ),
        getWorkspaceUserGroupAttendanceShowManagers(data.wsId, authOptions),
      ]
    );
    const initialSessions = sessionsResponse.data.map((session) => ({
      endTimezone: session.endTimezone,
      endsAt: session.endsAt,
      groupId: session.groupId,
      groupName: session.groupName,
      id: session.id,
      startTimezone: session.startTimezone,
      startsAt: session.startsAt,
      tags: session.tags.map((tag) => ({
        color: tag.color,
        id: tag.id,
        name: tag.name,
      })),
      title: session.title,
    }));
    const initialSessionId = findValidAttendanceSessionId(
      initialSessions,
      data.date,
      data.requestedSessionId
    );
    const attendanceRows = await listWorkspaceUserGroupAttendance(
      data.wsId,
      data.groupId,
      { date: data.date, sessionId: initialSessionId },
      authOptions
    );

    return {
      group: {
        ending_date: group.ending_date ?? null,
        id: group.id,
        name: group.name ?? null,
        starting_date: group.starting_date ?? null,
      },
      initialAttendance: toAttendanceMap(attendanceRows, initialSessionId),
      initialDate: data.date,
      initialMembers: membersResponse.data as AttendanceMember[],
      initialSessionId,
      initialSessions,
      initialShowManagers: showManagers,
    };
  });

export const Route = createFileRoute(
  '/$locale/$wsId/users/groups/$groupId/attendance'
)({
  component: GroupAttendanceRoutePage,
  validateSearch: (search: Record<string, unknown>): AttendanceSearch => ({
    date: getSearchString(search.date),
    session: getSearchString(search.session),
  }),
  loaderDeps: ({ search }) => ({
    date: search.date,
    session: search.session,
  }),
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Manage Attendance in the Group area of your Tuturuuu workspace.',
      locale,
      title: 'Attendance',
    });
  },
  loader: async ({ deps, params }): Promise<GroupAttendanceData> => {
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/users/groups/${params.groupId}/attendance`,
    });

    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists) {
      throw notFound();
    }

    const canCheckAttendance = await hasWorkspacePermission({
      data: {
        permission: 'check_user_attendance',
        wsId: workspace.workspaceId,
      },
    });
    if (!canCheckAttendance) {
      throw notFound();
    }

    const [routeData, canUpdateAttendance] = await Promise.all([
      loadGroupAttendanceData({
        data: {
          date: resolveAttendanceDate(deps.date),
          groupId: params.groupId,
          requestedSessionId: deps.session ?? null,
          wsId: workspace.workspaceId,
        },
      }),
      hasWorkspacePermission({
        data: {
          permission: 'update_user_attendance',
          wsId: workspace.workspaceId,
        },
      }),
    ]);

    if (!routeData) {
      throw notFound();
    }

    return {
      ...routeData,
      canUpdateAttendance,
      workspaceId: workspace.workspaceId,
    };
  },
});

function GroupAttendanceRoutePage() {
  const data = Route.useLoaderData() as GroupAttendanceData | undefined;
  const { groupId } = Route.useParams();

  if (!data) {
    throw notFound();
  }

  return (
    <GroupAttendanceClient
      canUpdateAttendance={data.canUpdateAttendance}
      endingDate={data.group.ending_date}
      groupId={groupId}
      initialAttendance={data.initialAttendance}
      initialDate={data.initialDate}
      initialMembers={data.initialMembers}
      initialSessionId={data.initialSessionId}
      initialSessions={data.initialSessions}
      initialShowManagers={data.initialShowManagers}
      startingDate={data.group.starting_date}
      wsId={data.workspaceId}
    />
  );
}
