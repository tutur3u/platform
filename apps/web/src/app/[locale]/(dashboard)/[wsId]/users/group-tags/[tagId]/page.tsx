import { getUserGroupColumns } from './columns';
import UserGroupForm from './form';
import { CustomDataTable } from '@/components/custom-data-table';
import { createClient } from '@tutur3u/supabase/next/server';
import { UserGroup } from '@repo/types/primitives/UserGroup';
import { UserGroupTag } from '@repo/types/primitives/UserGroupTag';
import FeatureSummary from '@repo/ui/components/ui/custom/feature-summary';
import { Separator } from '@repo/ui/components/ui/separator';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

interface SearchParams {
  q?: string;
  page?: string;
  pageSize?: string;
  excludedTags?: string | string[];
}

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
    tagId: string;
  }>;
  searchParams: Promise<SearchParams>;
}

export default async function GroupTagDetailsPage({
  params,
  searchParams,
}: Props) {
  const t = await getTranslations();
  const { locale, wsId, tagId } = await params;

  const tag = await getData(wsId, tagId);

  const { data: rawUserGroups, count: userGroupsCount } = await getGroupData(
    wsId,
    tagId,
    await searchParams
  );

  const userGroups = rawUserGroups.map((g) => ({
    ...g,
    href: `/${wsId}/users/groups/${g.id}`,
  }));

  return (
    <>
      <FeatureSummary
        pluralTitle={tag.name || t('ws-user-groups.plural')}
        singularTitle={tag.name || t('ws-user-groups.singular')}
        description={t('ws-user-groups.description')}
        createTitle={t('ws-user-group-tags.add_group')}
        createDescription={t('ws-user-group-tags.add_group_description')}
        form={<UserGroupForm tagId={tagId} wsId={wsId} />}
      />
      <Separator className="my-4" />

      <CustomDataTable
        data={userGroups}
        namespace="user-group-data-table"
        columnGenerator={getUserGroupColumns}
        extraData={{ locale, wsId, tagId }}
        count={userGroupsCount}
        defaultVisibility={{
          id: false,
          created_at: false,
        }}
      />
    </>
  );
}

async function getData(wsId: string, tagId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('workspace_user_group_tags')
    .select('*')
    .eq('ws_id', wsId)
    .eq('id', tagId)
    .maybeSingle();

  if (error) throw error;
  if (!data) notFound();

  return data as UserGroupTag;
}

async function getGroupData(
  wsId: string,
  tagId: string,
  {
    q,
    page = '1',
    pageSize = '10',
    excludedTags = [],
    retry = true,
  }: SearchParams & { retry?: boolean } = {}
) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('workspace_user_group_tag_groups')
    .select('...workspace_user_groups!inner(*)', {
      count: 'exact',
    })
    .eq('tag_id', tagId);

  if (q) queryBuilder.ilike('workspace_user_groups.name', `%${q}%`);

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
    return getGroupData(wsId, tagId, {
      q,
      pageSize,
      excludedTags,
      retry: false,
    });
  }

  return { data, count } as unknown as { data: UserGroup[]; count: number };
}
