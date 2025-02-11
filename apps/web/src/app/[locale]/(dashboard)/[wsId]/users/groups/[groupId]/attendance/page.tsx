import UserAttendances from '../../../attendance/user-attendances';
import UserAttendancesSkeleton from '../../../attendance/user-attendances-skeleton';
import { Filter } from '../../../filters';
import { CustomMonthPicker } from '@/components/custom-month-picker';
import { cn } from '@/lib/utils';
import { createClient } from '@tutur3u/supabase/next/server';
import { UserGroup } from '@tutur3u/types/primitives/UserGroup';
import { Button } from '@tutur3u/ui/button';
import FeatureSummary from '@tutur3u/ui/custom/feature-summary';
import { Separator } from '@tutur3u/ui/separator';
import 'dayjs/locale/vi';
import {
  CalendarIcon,
  ChartColumn,
  FileUser,
  MinusCircle,
  UserCheck,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

interface SearchParams {
  q?: string;
  page?: string;
  pageSize?: string;
  month?: string; // yyyy-MM

  includedGroups?: string | string[];
  excludedGroups?: string | string[];
}

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
    groupId: string;
  }>;
  searchParams: Promise<SearchParams>;
}

export default async function UserGroupAttendancePage({
  params,
  searchParams,
}: Props) {
  const t = await getTranslations();
  const { locale, wsId, groupId } = await params;

  const group = await getData(wsId, groupId);
  const { data: excludedUserGroups } = await getExcludedUserGroups(
    wsId,
    groupId
  );

  return (
    <>
      <FeatureSummary
        title={
          <>
            <h1 className="w-full text-2xl font-bold">
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
      <div className="mb-4 grid flex-wrap items-start gap-2 md:flex">
        <CustomMonthPicker
          lang={locale}
          className="col-span-full md:col-span-1"
        />
        <Filter
          key="excluded-user-groups-filter"
          tag="excludedGroups"
          title={t('user-data-table.excluded_groups')}
          icon={<MinusCircle className="mr-2 h-4 w-4" />}
          options={excludedUserGroups.map((group) => ({
            label: group.name || 'No name',
            value: group.id,
            count: group.amount,
          }))}
        />
      </div>

      <Suspense
        fallback={<UserAttendancesSkeleton searchParams={await searchParams} />}
      >
        <UserAttendances
          wsId={wsId}
          searchParams={{ ...(await searchParams), includedGroups: [groupId] }}
        />
      </Suspense>
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

async function getExcludedUserGroups(wsId: string, groupId: string) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .rpc(
      'get_possible_excluded_groups',
      {
        _ws_id: wsId,
        included_groups: [groupId],
      },
      {
        count: 'exact',
      }
    )
    .select('id, name, amount')
    .order('name');

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count } as { data: UserGroup[]; count: number };
}
