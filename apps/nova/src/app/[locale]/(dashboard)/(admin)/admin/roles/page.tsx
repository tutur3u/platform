import WhitelistEmailClient from './client-page';
import { getNovaRoleColumns } from './columns';
import { CustomDataTable } from '@/components/custom-data-table';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

interface SearchParams {
  q?: string;
  page?: string;
  pageSize?: string;
}

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<SearchParams>;
}

export default async function WhitelistPage({ params, searchParams }: Props) {
  const t = await getTranslations();
  const { wsId } = await params;

  const { emailData, emailCount } = await getEmailData(
    wsId,
    await searchParams
  );

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-ai-whitelist-emails.plural')}
        singularTitle={t('ws-ai-whitelist-emails.singular')}
        description={t('ws-ai-whitelist-emails.description')}
        createTitle={t('ws-ai-whitelist-emails.create')}
        createDescription={t('ws-ai-whitelist-emails.create_description')}
        form={<WhitelistEmailClient wsId={wsId} />}
      />
      <Separator className="my-4" />
      <CustomDataTable
        data={emailData}
        columnGenerator={getNovaRoleColumns}
        count={emailCount}
        defaultVisibility={{
          id: false,
          created_at: false,
        }}
      />
    </>
  );
}

async function getEmailData(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
    retry = true,
  }: { q?: string; page?: string; pageSize?: string; retry?: boolean } = {}
) {
  const supabase = await createAdminClient();
  if (!supabase) notFound();

  const queryBuilder = supabase
    .from('nova_roles')
    .select('*', {
      count: 'exact',
    })
    .order('created_at', { ascending: false });

  if (q) queryBuilder.ilike('email', `%${q}%`);

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
    return getEmailData(wsId, { q, pageSize, retry: false });
  }

  return {
    emailData: data,
    emailCount: count,
  };
}
