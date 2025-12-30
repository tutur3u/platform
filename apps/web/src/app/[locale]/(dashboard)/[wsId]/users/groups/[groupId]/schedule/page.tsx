import {
  CalendarIcon,
  ChartColumn,
  FileUser,
  UserCheck,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { Button } from '@tuturuuu/ui/button';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { cn } from '@tuturuuu/utils/format';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import ScheduleCalendar from './schedule-calendar';

export const metadata: Metadata = {
  title: 'Schedule',
  description: 'Manage Schedule in the Group area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
    groupId: string;
  }>;
}

export default async function UserGroupDetailsPage({ params }: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId, groupId, locale }) => {
        // Layout handles group selection when groupId is '~'
        if (groupId === '~') {
          return null;
        }

        const { containsPermission } = await getPermissions({ wsId });

        const canCheckUserAttendance = containsPermission(
          'check_user_attendance'
        );

        const canUpdateUserGroups = containsPermission('update_user_groups');

        const t = await getTranslations();
        const group = await getData(wsId, groupId);

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
                  <Button
                    type="button"
                    variant="secondary"
                    className={cn(
                      'border font-semibold max-sm:w-full',
                      'border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue hover:bg-dynamic-blue/20'
                    )}
                    disabled
                  >
                    <CalendarIcon className="h-5 w-5" />
                    {t('ws-user-group-details.schedule')}
                  </Button>
                  {canCheckUserAttendance && (
                    <Link href={`/${wsId}/users/groups/${groupId}/attendance`}>
                      <Button
                        type="button"
                        variant="secondary"
                        className={cn(
                          'border font-semibold max-sm:w-full',
                          'border-dynamic-purple/20 bg-dynamic-purple/10 text-dynamic-purple hover:bg-dynamic-purple/20'
                        )}
                      >
                        <UserCheck className="h-5 w-5" />
                        {t('ws-user-group-details.attendance')}
                      </Button>
                    </Link>
                  )}
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
              }
              createTitle={t('ws-user-groups.add_user')}
              createDescription={t('ws-user-groups.add_user_description')}
            />
            <Separator className="my-4" />
            <ScheduleCalendar
              locale={locale}
              wsId={wsId}
              groupId={groupId}
              initialSessions={group.sessions || []}
              hideOutsideMonthDays={true}
              canUpdateSchedule={canUpdateUserGroups}
            />
          </>
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
