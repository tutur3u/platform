import { createClient } from '@tuturuuu/supabase/next/server';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { MinusCircle, PlusCircle } from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { getLocale, getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { CustomMonthPicker } from '@/components/custom-month-picker';
import GeneralSearchBar from '@/components/general-search-bar';
import { Filter } from '../filters';
import UserAttendances from './user-attendances';
import UserAttendancesSkeleton from './user-attendances-skeleton';

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
    wsId: string;
  }>;
  searchParams: Promise<SearchParams>;
}

export default async function WorkspaceUserAttendancePage({
  params,
  searchParams,
}: Props) {
  const locale = await getLocale();
  const t = await getTranslations();
  const { wsId } = await params;

  const { data: userGroups } = await getUserGroups(wsId);
  const { data: excludedUserGroups } = await getExcludedUserGroups(
    wsId,
    await searchParams
  );

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-user-attendance.plural')}
        singularTitle={t('ws-user-attendance.singular')}
        description={t('ws-user-attendance.description')}
        createTitle={t('ws-user-attendance.create')}
        createDescription={t('ws-user-attendance.create_description')}
        // form={<UserGroupForm wsId={wsId} />}
      />
      <Separator className="my-4" />
      <div className="mb-4 grid flex-wrap items-start gap-2 md:flex">
        <GeneralSearchBar className="w-full md:max-w-xs" />
        <CustomMonthPicker
          lang={locale}
          className="col-span-full md:col-span-1"
        />
        <Filter
          key="included-user-groups-filter"
          tag="includedGroups"
          title={t('user-data-table.included_groups')}
          icon={<PlusCircle className="mr-2 h-4 w-4" />}
          options={userGroups.map((group) => ({
            label: group.name || 'No name',
            value: group.id,
            count: group.amount,
          }))}
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
        <UserAttendances wsId={wsId} searchParams={await searchParams} />
      </Suspense>
    </>
  );
}

async function getUserGroups(wsId: string) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('workspace_user_groups_with_amount')
    .select('id, name, amount', {
      count: 'exact',
    })
    .eq('ws_id', wsId)
    .order('name');

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count } as { data: UserGroup[]; count: number };
}

async function getExcludedUserGroups(
  wsId: string,
  { includedGroups }: SearchParams
) {
  const supabase = await createClient();

  if (!includedGroups || includedGroups.length === 0) {
    return getUserGroups(wsId);
  }

  const queryBuilder = supabase
    .rpc(
      'get_possible_excluded_groups',
      {
        _ws_id: wsId,
        included_groups: Array.isArray(includedGroups)
          ? includedGroups
          : [includedGroups],
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
