import { createClient } from '@tuturuuu/supabase/next/server';
import type { UserGroupTag } from '@tuturuuu/types/primitives/UserGroupTag';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CustomDataTable } from '@/components/custom-data-table';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { groupTagColumns } from './columns';
import GroupTagForm from './form';

export const metadata: Metadata = {
  title: 'Group Tags',
  description:
    'Manage Group Tags in the Users area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    q?: string;
    page?: string;
    pageSize?: string;
  }>;
}

export default async function WorkspaceUserGroupTagsPage({
  params,
  searchParams,
}: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const { data, count } = await getGroupTags(wsId, await searchParams);
        const t = await getTranslations('ws-user-group-tags');

        const tags = data.map((tag) => ({
          ...tag,
          href: `/${wsId}/users/group-tags/${tag.id}`,
        }));
        return (
          <>
            <FeatureSummary
              pluralTitle={t('plural')}
              singularTitle={t('singular')}
              description={t('description')}
              createTitle={t('create')}
              createDescription={t('create_description')}
              form={<GroupTagForm wsId={wsId} />}
            />
            <Separator className="my-4" />
            <CustomDataTable
              columnGenerator={groupTagColumns}
              namespace="user-group-tag-data-table"
              data={tags}
              count={count}
              defaultVisibility={{
                id: false,
                color: false,
                created_at: false,
              }}
            />
          </>
        );
      }}
    </WorkspaceWrapper>
  );
}

async function getGroupTags(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
  }: { q?: string; page?: string; pageSize?: string }
) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('workspace_user_group_tags')
    .select('*, group_ids:workspace_user_group_tag_groups(group_id)', {
      count: 'exact',
    })
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false });

  if (q) queryBuilder.ilike('name', `%${q}%`);

  if (page && pageSize) {
    const parsedPage = parseInt(page, 10);
    const parsedSize = parseInt(pageSize, 10);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return {
    data: data.map(({ group_ids, ...tag }) => ({
      ...tag,
      group_ids: group_ids.map((group) => group.group_id),
    })),
    count,
  } as { data: UserGroupTag[]; count: number };
}
