import { getEmailColumns } from './columns';
import { CustomDataTable } from '@/components/custom-data-table';
import { verifyHasSecrets } from '@/lib/workspace-helper';
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
  params: {
    locale: string;
    wsId: string;
  };
  searchParams: SearchParams;
}

export default async function WorkspaceUsersPage({
  params: { locale, wsId },
  searchParams,
}: Props) {
  await verifyHasSecrets(wsId, ['ENABLE_USERS'], `/${wsId}`);
  const t = await getTranslations();

  const { data: emails, count } = await getData(wsId, searchParams);

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
        namespace="user-data-table"
        columnGenerator={getEmailColumns}
        extraData={{ locale }}
        count={count}
        defaultVisibility={{
          id: false,
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
  const supabase = createClient();

  const queryBuilder = supabase.from('sent_emails').select('*');

  if (page && pageSize) {
    const parsedPage = Number.parseInt(page);
    const parsedSize = Number.parseInt(pageSize);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data, error, count } = await queryBuilder;

  if (error) {
    if (!retry) throw error;
    return getData(wsId, { q, pageSize, retry: false });
  }

  return { data, count };
}
