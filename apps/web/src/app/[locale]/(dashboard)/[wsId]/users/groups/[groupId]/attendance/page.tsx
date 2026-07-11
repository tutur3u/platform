import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { InitialAttendanceProps } from '@tuturuuu/users-ui/components/group-attendance-client';
import GroupAttendanceClient from '@tuturuuu/users-ui/components/group-attendance-client';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import {
  getGroupGuestUserIds,
  getGroupRow,
} from '@/lib/user-groups/server-data';
import { listUserGroupSessions } from '@/lib/user-groups/session-schedule';

export const metadata: Metadata = {
  title: 'Attendance',
  description:
    'Manage Attendance in the Group area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
    groupId: string;
  }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function UserGroupAttendancePage({
  params,
  searchParams,
}: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId, groupId }) => {
        const permissions = await getPermissions({
          wsId,
        });
        if (!permissions) notFound();
        const { containsPermission } = permissions;
        const canCheckUserAttendance = containsPermission(
          'check_user_attendance'
        );
        if (!canCheckUserAttendance) {
          notFound();
        }
        const canUpdateAttendance = containsPermission(
          'update_user_attendance'
        );
        const sp = await searchParams;

        const requestedDateParam = sp?.date;
        const requestedSessionParam = sp?.session;
        const requestedDate = Array.isArray(requestedDateParam)
          ? requestedDateParam[0]
          : requestedDateParam;
        const requestedSessionId = Array.isArray(requestedSessionParam)
          ? requestedSessionParam[0]
          : requestedSessionParam;
        const fallbackToday = new Date().toISOString().slice(0, 10);
        const effectiveDate =
          requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
            ? requestedDate
            : fallbackToday;

        const group = await getGroupRow(wsId, groupId);
        if (!group) notFound();

        const {
          sessions,
          members,
          attendance: attendanceMap,
        } = await getInitialAttendanceData(
          wsId,
          groupId,
          effectiveDate,
          requestedSessionId
        );

        return (
          <GroupAttendanceClient
            wsId={wsId}
            groupId={groupId}
            initialSessions={sessions}
            initialMembers={members}
            initialDate={effectiveDate}
            initialAttendance={attendanceMap}
            canUpdateAttendance={canUpdateAttendance}
            startingDate={group.starting_date}
            endingDate={group.ending_date}
          />
        );
      }}
    </WorkspaceWrapper>
  );
}

async function getInitialAttendanceData(
  wsId: string,
  groupId: string,
  dateYYYYMMDD: string,
  sessionId?: string | null
) {
  const sbAdmin = await createAdminClient();
  const monthStart = new Date(`${dateYYYYMMDD}T00:00:00.000Z`);
  const rangeStart = new Date(
    monthStart.getUTCFullYear(),
    monthStart.getUTCMonth(),
    1 - 7
  );
  const rangeEnd = new Date(
    monthStart.getUTCFullYear(),
    monthStart.getUTCMonth() + 1,
    8
  );

  // Members and the day's attendance are independent — fetch in parallel.
  const attendanceQuery = sbAdmin
    .from('user_group_attendance')
    .select('user_id, status, notes, session_id')
    .eq('group_id', groupId)
    .eq('date', dateYYYYMMDD);

  const [membersRes, attRes, sessionData] = await Promise.all([
    sbAdmin
      .from('workspace_user_groups_users')
      .select(
        'workspace_users!workspace_user_roles_users_user_id_fkey!inner(*), role'
      )
      .eq('group_id', groupId),
    sessionId
      ? attendanceQuery.or(`session_id.eq.${sessionId},session_id.is.null`)
      : attendanceQuery.is('session_id', null),
    listUserGroupSessions({
      from: rangeStart.toISOString(),
      groupId,
      supabase: sbAdmin,
      to: rangeEnd.toISOString(),
      wsId,
    }),
  ]);

  const membersRows = membersRes.data ?? [];
  const attendanceRows = (attRes.data ?? []) as unknown as Array<{
    user_id: string;
    status: string;
    notes: string | null;
  }>;

  // Batch guest lookup instead of one is_user_guest RPC per member.
  const guestIds = await getGroupGuestUserIds(
    sbAdmin,
    membersRows.map((row) => row.workspace_users.id)
  );

  const members = membersRows.map((row) => ({
    id: row.workspace_users.id,
    display_name: row.workspace_users.display_name,
    full_name: row.workspace_users.full_name,
    email: row.workspace_users.email,
    phone: row.workspace_users.phone,
    avatar_url: row.workspace_users.avatar_url,
    archived: row.workspace_users.archived,
    archived_until: row.workspace_users.archived_until,
    role: row.role,
    isGuest: guestIds.has(row.workspace_users.id),
  }));

  type AttendanceEntry = NonNullable<
    InitialAttendanceProps['initialAttendance']
  >[string];

  const attendance: Record<string, AttendanceEntry> = {};
  for (const r of attendanceRows) {
    attendance[r.user_id] = {
      status: r.status as AttendanceEntry['status'],
      note: r.notes ?? '',
    };
  }

  return {
    sessions: sessionData.data,
    members,
    attendance,
  };
}
