import { getEmailColumns } from './columns';
import { CustomDataTable } from '@/components/custom-data-table';
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
    .from('sent_emails')
    .select(
      '*, ...users(sender:display_name), recipient:workspace_users(display_name, full_name)'
    );

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
    return getData(wsId, { q, pageSize, retry: false });
  }

  return {
    data: data.map(({ recipient, ...rest }) => ({
      ...rest,
      recipient: recipient?.full_name || recipient?.display_name,
    })),
    count,
  };
}
