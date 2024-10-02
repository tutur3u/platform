import { getPostEmailColumns } from './columns';
import { CustomDataTable } from '@/components/custom-data-table';
import { PostEmail } from '@/types/primitives/post-email';
import { createClient } from '@/utils/supabase/server';
import FeatureSummary from '@repo/ui/components/ui/custom/feature-summary';
import { Separator } from '@repo/ui/components/ui/separator';
import { getTranslations } from 'next-intl/server';

interface SearchParams {
  q?: string;
  page?: string;
  pageSize?: string;
}

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
  searchParams: Promise<SearchParams>;
}

export default async function WorkspacePostEmailsPage({
  params,
  searchParams,
}: Props) {
  const t = await getTranslations();
  const { locale, wsId } = await params;

  const { data, count } = await getData(wsId, await searchParams);

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-post-emails.plural')}
        singularTitle={t('ws-post-emails.singular')}
        description={t('ws-post-emails.description')}
      />
      <Separator className="my-4" />
      <CustomDataTable
        data={data}
        namespace="post-email-data-table"
        columnGenerator={getPostEmailColumns}
        extraData={{ locale }}
        count={count}
        defaultVisibility={{
          id: false,
          email: false,
          subject: false,
          is_completed: false,
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
  }: SearchParams & { retry?: boolean } = {}
) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('user_group_post_checks')
    .select(
      'notes, user_id, email_id, is_completed, user:workspace_users!inner(email, display_name, full_name, ws_id), ...user_group_posts(post_id:id, post_title:title, post_content:content, ...workspace_user_groups(group_id:id, group_name:name)), ...sent_emails(subject)',
      {
        count: 'exact',
      }
    )
    .eq('workspace_users.ws_id', wsId)
    // workspace_users.email doesn't include @easy
    .not('workspace_users.email', 'ilike', '%@easy%');

  if (page && pageSize) {
    const parsedPage = Number.parseInt(page);
    const parsedSize = Number.parseInt(pageSize);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data, error, count } = await queryBuilder.order('created_at', {
    ascending: false,
  });

  // console.log('data', data);

  if (error) {
    if (!retry) throw error;
    return getData(wsId, { q, pageSize, retry: false });
  }

  return {
    data: data.map(({ user, ...rest }) => ({
      ...rest,
      ws_id: user?.ws_id,
      email: user?.email,
      recipient: user?.full_name || user?.display_name,
    })),
    count: count || 0,
  } as { data: PostEmail[]; count: number };
}
