import { getUserGroupColumns } from './columns';
import Filters from './filters';
import UserGroupForm from './form';
import { CustomDataTable } from '@/components/custom-data-table';
import { createClient } from '@ncthub/supabase/next/server';
import { UserGroup } from '@ncthub/types/primitives/UserGroup';
import FeatureSummary from '@ncthub/ui/custom/feature-summary';
import { Separator } from '@ncthub/ui/separator';
import { getTranslations } from 'next-intl/server';

interface SearchParams {
  q?: string;
  page?: string;
  pageSize?: string;
  includedTags?: string | string[];
  excludedTags?: string | string[];
}

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<SearchParams>;
}

export default async function WorkspaceUserGroupsPage({
  params,
  searchParams,
}: Props) {
  const t = await getTranslations();
  const { wsId } = await params;

  const { data, count } = await getData(wsId, await searchParams);

  const groups = data.map((g) => ({
    ...g,
    ws_id: wsId,
    href: `/${wsId}/users/groups/${g.id}`,
  }));

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-user-groups.plural')}
        singularTitle={t('ws-user-groups.singular')}
        description={t('ws-user-groups.description')}
        createTitle={t('ws-user-groups.create')}
        createDescription={t('ws-user-groups.create_description')}
        form={<UserGroupForm wsId={wsId} />}
      />
      <Separator className="my-4" />
      <CustomDataTable
        data={groups}
        columnGenerator={getUserGroupColumns}
        namespace="user-group-data-table"
        count={count}
        filters={<Filters wsId={wsId} searchParams={await searchParams} />}
        defaultVisibility={{
          id: false,
          locked: false,
          created_at: false,
        }}
      />
    </>
  );
}

async function getData(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
    retry = true,
  }: { q?: string; page?: string; pageSize?: string; retry?: boolean } = {}
) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('workspace_user_groups_with_amount')
    .select(
      'id, ws_id, name, starting_date, ending_date, archived, notes, amount, created_at',
      {
        count: 'exact',
      }
    )
    .eq('ws_id', wsId)
    .order('name');

  if (q) queryBuilder.ilike('name', `%${q}%`);

  if (page && pageSize) {
    const parsedPage = parseInt(page);
    const parsedSize = parseInt(pageSize);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data, error, count } = await queryBuilder;
  if (error) {
    if (!retry) throw error;
    return getData(wsId, { q, pageSize, retry: false });
  }

  return { data, count } as { data: UserGroup[]; count: number };
}
