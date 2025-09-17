import { createClient } from '@tuturuuu/supabase/next/server';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { Button } from '@tuturuuu/ui/button';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import {
  CalendarIcon,
  ChartColumn,
  FileUser,
  UserCheck,
} from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { cn } from '@tuturuuu/utils/format';
import 'dayjs/locale/vi';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import GroupAttendanceClient from './client';
import type { InitialAttendanceProps } from './client';

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
  const t = await getTranslations();
  const { wsId, groupId } = await params;
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
    <>
      <FeatureSummary
        title={
          <>
            <h1 className="w-full font-bold text-2xl">
              {group.name || t('ws-user-groups.singular')}
            </h1>
            <Separator className="my-2" />
          </>
        }
        description={
          <>
            <div className="grid flex-wrap gap-2 md:flex">
              <Link href={`/${wsId}/users/groups/${groupId}`}>
                <Button
                  type="button"
                  variant="secondary"
                  className={cn(
                    'border font-semibold max-sm:w-full',
                    'border-foreground/20 bg-foreground/10 text-foreground hover:bg-foreground/20'
                  )}
                >
                  <CalendarIcon className="h-5 w-5" />
                  {t('infrastructure-tabs.overview')}
                </Button>
              </Link>
              <Link href={`/${wsId}/users/groups/${groupId}/schedule`}>
                <Button
                  type="button"
                  variant="secondary"
                  className={cn(
                    'border font-semibold max-sm:w-full',
                    'border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue hover:bg-dynamic-blue/20'
                  )}
                >
                  <CalendarIcon className="h-5 w-5" />
                  {t('ws-user-group-details.schedule')}
                </Button>
              </Link>
              <Button
                type="button"
                variant="secondary"
                className={cn(
                  'border font-semibold max-sm:w-full',
                  'border-dynamic-purple/20 bg-dynamic-purple/10 text-dynamic-purple hover:bg-dynamic-purple/20'
                )}
                disabled
              >
                <UserCheck className="h-5 w-5" />
                {t('ws-user-group-details.attendance')}
              </Button>
              <Link href={`/${wsId}/users/groups/${groupId}/reports`}>
                <Button
                  type="button"
                  variant="secondary"
                  className={cn(
                    'border font-semibold max-sm:w-full',
                    'border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green hover:bg-dynamic-green/20'
                  )}
                >
                  <FileUser className="h-5 w-5" />
                  {t('ws-user-group-details.reports')}
                </Button>
              </Link>
              <Link href={`/${wsId}/users/groups/${groupId}/indicators`}>
                <Button
                  type="button"
                  variant="secondary"
                  className={cn(
                    'border font-semibold max-sm:w-full',
                    'border-dynamic-red/20 bg-dynamic-red/10 text-dynamic-red hover:bg-dynamic-red/20'
                  )}
                >
                  <ChartColumn className="h-5 w-5" />
                  {t('ws-user-group-details.metrics')}
                </Button>
              </Link>
            </div>
          </>
        }
        createTitle={t('ws-user-groups.add_user')}
        createDescription={t('ws-user-groups.add_user_description')}
      />
      <Separator className="my-4" />
      <GroupAttendanceClient
        wsId={wsId}
        groupId={groupId}
        initialSessions={sessions}
        initialMembers={members}
        initialDate={effectiveDate}
        initialAttendance={attendanceMap}
      />
    </>
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
    .select('workspace_users(*)')
    .eq('group_id', groupId)
    .eq('role', 'STUDENT');

  const members =
    membersRows?.map((row: any) => ({
      id: row.workspace_users?.id,
      display_name: row.workspace_users?.display_name,
      full_name: row.workspace_users?.full_name,
      email: row.workspace_users?.email,
      phone: row.workspace_users?.phone,
      avatar_url: row.workspace_users?.avatar_url,
    })) ?? [];

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
