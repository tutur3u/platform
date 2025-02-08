import { cn } from '@/lib/utils';
import { createClient } from '@repo/supabase/next/server';
import { UserGroup } from '@repo/types/primitives/UserGroup';
import { WorkspaceUser } from '@repo/types/primitives/WorkspaceUser';
import { Button } from '@repo/ui/components/ui/button';
import FeatureSummary from '@repo/ui/components/ui/custom/feature-summary';
import { Separator } from '@repo/ui/components/ui/separator';
import 'dayjs/locale/vi';
import { CalendarIcon, ChartColumn, FileUser, UserCheck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
    groupId: string;
  }>;
}

export default async function UserGroupIndicatorsPage({ params }: Props) {
  const t = await getTranslations();
  const { wsId, groupId } = await params;

  const group = await getData(wsId, groupId);
  const indicators = await getIndicators(groupId);
  const groupIndicators = await getGroupIndicators(groupId);
  const { data: users } = await getUserData(wsId, groupId);

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
              <Button
                type="button"
                variant="secondary"
                className={cn(
                  'border font-semibold max-sm:w-full',
                  'border-dynamic-red/20 bg-dynamic-red/10 text-dynamic-red hover:bg-dynamic-red/20'
                )}
                disabled
              >
                <ChartColumn className="h-5 w-5" />
                {t('ws-user-group-details.metrics')}
              </Button>
            </div>
          </>
        }
        createTitle={t('ws-user-groups.add_user')}
        createDescription={t('ws-user-groups.add_user_description')}
      />
      <Separator className="my-4" />
      <div className="flex items-center rounded-lg border text-center max-md:overflow-x-auto">
        <div className="border-r font-semibold">
          <div className="px-4 py-2">#</div>
          {users.map((user, index) => (
            <div key={user.id} className="border-t px-4 py-2">
              {index + 1}
            </div>
          ))}
        </div>
        <div className="flex-none border-r">
          <div className="w-full px-4 py-2 font-semibold md:flex-none">
            {t('ws-users.full_name')}
          </div>
          {users.map((user) => (
            <div key={user.id} className="border-t px-4 py-2">
              <span className="line-clamp-1 break-all">{user.full_name}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center md:overflow-x-auto">
          {groupIndicators.map((indicator) => (
            <div className="grid border-r last:border-r-0">
              <button
                key={indicator.id}
                className="w-32 px-4 py-2 font-semibold hover:bg-dynamic-purple/10 hover:text-dynamic-purple"
              >
                <span className="line-clamp-1 break-all">{indicator.name}</span>
              </button>
              {users.map((user) => (
                <button
                  key={user.id}
                  className="w-32 border-t px-4 py-2 hover:bg-dynamic-blue/10 hover:text-dynamic-blue"
                >
                  {indicators.find(
                    (i) =>
                      i.user_id === user.id && i.indicator_id === indicator.id
                  )?.value || '-'}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="grid flex-none border-l">
          <div className="px-4 py-2 font-semibold">{t('common.average')}</div>
          {users.map(
            (user) => (
              <div key={user.id} className="border-t px-4 py-2">
                {groupIndicators.filter((i) =>
                  indicators.find(
                    (j) => j.user_id === user.id && j.indicator_id === i.id
                  )
                ).length
                  ? (
                      groupIndicators.reduce((acc, indicator) => {
                        const value = indicators.find(
                          (i) =>
                            i.user_id === user.id &&
                            i.indicator_id === indicator.id
                        )?.value;
                        if (value) {
                          acc += value;
                        }
                        return acc;
                      }, 0) /
                      groupIndicators.filter((i) =>
                        indicators.find(
                          (j) =>
                            j.user_id === user.id && j.indicator_id === i.id
                        )
                      ).length
                    ).toPrecision(2)
                  : '-'}
              </div>
            ),
            0
          )}
        </div>
      </div>
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

async function getGroupIndicators(groupId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('user_group_indicators')
    .select('id:indicator_id, ...healthcare_vitals(name)')
    .eq('group_id', groupId);

  if (error) throw error;
  if (!data) notFound();

  return data;
}

async function getIndicators(groupId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('user_indicators')
    .select('*')
    .eq('group_id', groupId);

  if (error) throw error;
  if (!data) notFound();

  return data;
}

async function getUserData(wsId: string, groupId: string) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .rpc(
      'get_workspace_users',
      {
        _ws_id: wsId,
        included_groups: [groupId],
        excluded_groups: [],
        search_query: '',
      },
      {
        count: 'exact',
      }
    )
    .select('*')
    .order('full_name', { ascending: true, nullsFirst: false });

  const { data, error, count } = await queryBuilder;
  if (error) throw error;
  return { data, count } as unknown as { data: WorkspaceUser[]; count: number };
}
