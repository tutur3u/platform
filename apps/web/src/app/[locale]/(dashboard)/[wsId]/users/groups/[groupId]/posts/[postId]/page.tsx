import GroupMemberForm from '../../form';
import CardList from './card-list';
import { verifyHasSecrets } from '@/lib/workspace-helper';
import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import { createClient } from '@/utils/supabase/server';
import FeatureSummary from '@repo/ui/components/ui/custom/feature-summary';
import { Separator } from '@repo/ui/components/ui/separator';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

interface SearchParams {
  q?: string;
  page?: string;
  pageSize?: string;
  excludedGroups?: string | string[];
}

interface Props {
  params: {
    locale: string;
    wsId: string;
    groupId: string;
    postId: string;
  };
  searchParams: SearchParams;
}

export default async function HomeworkCheck({
  params: { wsId, groupId, postId },
  searchParams,
}: Props) {
  await verifyHasSecrets(wsId, ['ENABLE_USERS'], `/${wsId}`);
  const t = await getTranslations();

  const post = await getPostData(postId);
  const group = await getGroupData(wsId, groupId);

  const { data: rawUsers } = await getUserData(wsId, groupId, searchParams);
  const users = rawUsers.map((u) => ({
    ...u,
    href: `/${wsId}/users/database/${u.id}`,
  }));
  return (
    <div>
      <FeatureSummary
        pluralTitle={group.name || t('ws-user-groups.plural')}
        singularTitle={group.name || t('ws-user-groups.singular')}
        description={t('ws-user-groups.description')}
        createTitle={t('ws-user-groups.add_user')}
        createDescription={t('ws-user-groups.add_user_description')}
        form={<GroupMemberForm wsId={wsId} groupId={groupId} />}
      />
      <Separator className="my-4" />
      <CardList wsId={wsId} post={post} users={users}></CardList>
    </div>
  );
}

async function getPostData(postId: string) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('user_group_posts')
    .select('*')
    .eq('id', postId)
    .maybeSingle();

  if (error) throw error;
  if (!data) notFound();

  return data;
}

async function getGroupData(wsId: string, groupId: string) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('workspace_user_groups')
    .select('*')
    .eq('ws_id', wsId)
    .eq('id', groupId)
    .maybeSingle();

  if (error) throw error;
  if (!data) notFound();

  return data;
}

async function getUserData(
  wsId: string,
  groupId: string,
  {
    q,
    page = '1',
    pageSize = '10',
    excludedGroups = [],
    retry = true,
  }: SearchParams & { retry?: boolean } = {}
) {
  const supabase = createClient();

  const queryBuilder = supabase
    .rpc(
      'get_workspace_users',
      {
        _ws_id: wsId,
        included_groups: [groupId],
        excluded_groups: Array.isArray(excludedGroups)
          ? excludedGroups
          : [excludedGroups],
        search_query: q || '',
      },
      {
        count: 'exact',
      }
    )
    .select('*')
    .order('full_name', { ascending: true, nullsFirst: false });

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
    return getUserData(wsId, groupId, {
      q,
      pageSize,
      excludedGroups,
      retry: false,
    });
  }

  return { data, count } as unknown as { data: WorkspaceUser[]; count: number };
}
