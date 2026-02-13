import { createClient } from '@tuturuuu/supabase/next/server';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import type { InitialAttendanceProps } from './client';
import GroupAttendanceClient from './client';

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
        const requestedDate = Array.isArray(requestedDateParam)
          ? requestedDateParam[0]
          : requestedDateParam;
        const fallbackToday = new Date().toISOString().slice(0, 10);
        const effectiveDate =
          requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
            ? requestedDate
            : fallbackToday;

        const group = await getData(wsId, groupId);
        const {
          sessions,
          members,
          attendance: attendanceMap,
        } = await getInitialAttendanceData(wsId, groupId, effectiveDate);

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

async function getData(wsId: string, groupId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('workspace_user_groups')
    .select('*')
    .eq('ws_id', wsId)
    .eq('id', groupId)
    .maybeSingle();

  if (error) throw error;
  if (!data) notFound();

  return data as UserGroup;
}

async function getInitialAttendanceData(
  wsId: string,
  groupId: string,
  dateYYYYMMDD: string
) {
  const supabase = await createClient();

  // Sessions
  const { data: groupRow } = await supabase
    .from('workspace_user_groups')
    .select('sessions')
    .eq('ws_id', wsId)
    .eq('id', groupId)
    .maybeSingle();

  // Members (basic profile info)
  const { data: membersRows } = await supabase
    .from('workspace_user_groups_users')
    .select('workspace_users(*), role')
    .eq('group_id', groupId);

  const members = await Promise.all(
    (membersRows || []).map(async (row: any) => {
      const { data: isGuest } = await supabase.rpc('is_user_guest', {
        user_uuid: row.workspace_users?.id,
      });

      return {
        id: row.workspace_users?.id,
        display_name: row.workspace_users?.display_name,
        full_name: row.workspace_users?.full_name,
        email: row.workspace_users?.email,
        phone: row.workspace_users?.phone,
        avatar_url: row.workspace_users?.avatar_url,
        archived: row.workspace_users?.archived,
        archived_until: row.workspace_users?.archived_until,
        role: row.role,
        isGuest: !!isGuest,
      };
    })
  );

  // Initial attendance for the requested date (seed hydration)
  const { data: attRows } = await supabase
    .from('user_group_attendance')
    .select('user_id,status,notes')
    .eq('group_id', groupId)
    .eq('date', dateYYYYMMDD);

  const attendance: Record<string, { status: unknown; note?: string }> = {};
  (attRows || []).forEach((r) => {
    attendance[(r as any).user_id] = {
      status: (r as any).status,
      note: (r as any).notes ?? '',
    };
  });

  return {
    sessions: (groupRow?.sessions as string[]) || [],
    members,
    attendance: attendance as NonNullable<
      InitialAttendanceProps['initialAttendance']
    >,
  };
}
