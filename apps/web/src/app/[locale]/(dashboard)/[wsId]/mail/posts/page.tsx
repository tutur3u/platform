import { getPostEmailColumns } from './columns';
import Filters from './filters';
import { CustomDataTable } from '@/components/custom-data-table';
import { PostEmail } from '@/types/primitives/post-email';
import { createClient } from '@/utils/supabase/server';
import FeatureSummary from '@repo/ui/components/ui/custom/feature-summary';
import { Separator } from '@repo/ui/components/ui/separator';
import { MailWarning, Send } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

interface SearchParams {
  page?: string;
  pageSize?: string;
  includedGroups?: string | string[];
  excludedGroups?: string | string[];
  userId?: string;
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
  const status = await getSentEmails(wsId, await searchParams);

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-post-emails.plural')}
        singularTitle={t('ws-post-emails.singular')}
        description={t('ws-post-emails.description')}
      />
      <Separator className="my-4" />
      <div className="gird-cols-1 grid gap-2 md:grid-cols-2">
        <div className="bg-dynamic-purple/15 text-dynamic-purple border-dynamic-purple/15 flex w-full flex-col items-center gap-1 rounded border p-4">
          <div className="flex items-center gap-2 text-xl font-bold">
            <Send />
            {t('ws-post-emails.sent_emails')}
          </div>
          <Separator className="bg-dynamic-purple/15 my-1" />
          <div className="text-xl font-semibold md:text-3xl">
            {status.count || 0}
            <span className="opacity-50">/{count || 0}</span>
          </div>
        </div>
        <div className="bg-dynamic-red/15 text-dynamic-red border-dynamic-red/15 flex w-full flex-col items-center gap-1 rounded border p-4">
          <div className="flex items-center gap-2 text-xl font-bold">
            <MailWarning />
            {t('ws-post-emails.pending_emails')}
          </div>
          <Separator className="bg-dynamic-red/15 my-1" />
          <div className="text-3xl font-semibold">
            {(count || 0) - (status.count || 0)}
            <span className="opacity-50">/{count || 0}</span>
          </div>
        </div>
      </div>
      <Separator className="my-4" />
      <CustomDataTable
        data={data}
        namespace="post-email-data-table"
        columnGenerator={getPostEmailColumns}
        extraData={{ locale }}
        count={count}
        filters={
          <Filters wsId={wsId} searchParams={await searchParams} noExclude />
        }
        defaultVisibility={{
          id: false,
          email: false,
          subject: false,
          is_completed: false,
          notes: false,
          created_at: false,
        }}
        disableSearch
      />
    </>
  );
}

async function getData(
  wsId: string,
  {
    page = '1',
    pageSize = '10',
    includedGroups = [],
    excludedGroups = [],
    userId,
    retry = true,
  }: SearchParams & { retry?: boolean } = {}
) {
  const supabase = await createClient();

  const hasFilters =
    includedGroups.length > 0 || excludedGroups.length > 0 || userId;

  const queryBuilder = supabase
    .from('user_group_post_checks')
    .select(
      `notes, user_id, email_id, is_completed, user:workspace_users!inner(email, display_name, full_name, ws_id), ...user_group_posts${
        hasFilters ? '!inner' : ''
      }(post_id:id, post_title:title, post_content:content, ...workspace_user_groups(group_id:id, group_name:name)), ...sent_emails(subject)`,
      {
        count: 'exact',
      }
    )
    .eq('workspace_users.ws_id', wsId)
    .not('workspace_users.email', 'ilike', '%@easy%');

  if (includedGroups.length > 0) {
    queryBuilder.in(
      'user_group_posts.group_id',
      Array.isArray(includedGroups) ? includedGroups : [includedGroups]
    );
  }

  if (excludedGroups.length > 0) {
    queryBuilder.not('user_group_posts.group_id', 'in', excludedGroups);
  }

  if (userId) {
    queryBuilder.eq('user_id', userId);
  }

  if (page && pageSize) {
    const parsedPage = Number.parseInt(page);
    const parsedSize = Number.parseInt(pageSize);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data, error, count } = await queryBuilder.order('created_at', {
    referencedTable: 'user_group_posts',
    ascending: false,
  });

  if (error) {
    if (!retry) throw error;
    return getData(wsId, { pageSize, retry: false });
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

async function getSentEmails(
  wsId: string,
  {
    includedGroups = [],
    excludedGroups = [],
    userId,
  }: SearchParams & { retry?: boolean } = {}
) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('user_group_post_checks')
    .select(
      'workspace_users!inner(ws_id), sent_emails!inner(*), user_group_posts!inner(group_id)',
      {
        head: true,
        count: 'exact',
      }
    )
    .eq('workspace_users.ws_id', wsId)
    .not('workspace_users.email', 'ilike', '%@easy%');

  if (includedGroups.length > 0) {
    queryBuilder.in(
      'user_group_posts.group_id',
      Array.isArray(includedGroups) ? includedGroups : [includedGroups]
    );
  }

  if (excludedGroups.length > 0) {
    queryBuilder.not('user_group_posts.group_id', 'in', excludedGroups);
  }

  if (userId) {
    queryBuilder.eq('user_id', userId);
  }

  const { count } = await queryBuilder;

  return {
    count,
  };
}
