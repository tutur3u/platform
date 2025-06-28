import { createClient } from '@tuturuuu/supabase/next/server';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getTranslations } from 'next-intl/server';
import { CustomDataTable } from '@/components/custom-data-table';
import Filters from '../posts/filters';
import { getEmailColumns } from './columns';

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

export default async function WorkspaceUsersPage({
  params,
  searchParams,
}: Props) {
  const t = await getTranslations();
  const { locale, wsId } = await params;

  const { data: emails, count } = await getData(wsId, await searchParams);

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-emails.plural')}
        singularTitle={t('ws-emails.singular')}
        description={t('ws-emails.description')}
      />
      <Separator className="my-4" />
      <CustomDataTable
        data={emails}
        namespace="email-data-table"
        columnGenerator={getEmailColumns}
        extraData={{ locale }}
        count={count}
        defaultVisibility={{
          id: false,
          sender: false,
          source_name: false,
          source_email: false,
        }}
        filters={
          <Filters wsId={wsId} searchParams={await searchParams} noExclude />
        }
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
    .from('sent_emails')
    .select(
      `*, ...users(sender:display_name), recipient:workspace_users(display_name, full_name), ...user_group_posts${
        hasFilters ? '!inner' : ''
      }(workspace_user_groups(group_id:id))`,
      {
        count: 'exact',
      }
    );

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
    queryBuilder.eq('receiver_id', userId);
  }

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

  if (error) {
    if (!retry) throw error;
    return getData(wsId, { pageSize, retry: false });
  }

  return {
    data: data.map(({ recipient, ...rest }) => ({
      ...rest,
      recipient: recipient?.full_name || recipient?.display_name,
    })),
    count,
  };
}
