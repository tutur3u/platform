import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { Button } from '@tuturuuu/ui/button';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { ArrowLeft } from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { CustomDataTable } from '@/components/custom-data-table';
import WhitelistEmailClient from './whitelist-client-page';
import { getNovaRoleColumns } from './whitelist-columns';

interface props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    q?: string;
    page?: string;
    pageSize?: string;
    tab?: string;
  }>;
}

export default async function WhitelistManagement({
  params,
  searchParams,
}: props) {
  const t = await getTranslations();
  const { q, page, pageSize } = await searchParams;
  const { wsId } = await params;

  // Fetch role data
  const { emailData, emailCount } = await getWhitelistData(wsId, {
    q,
    page: page || '1',
    pageSize: pageSize || '10',
  });

  return (
    <div className="p-4 md:p-8">
      <Link href={`/users`}>
        <Button variant="outline" className="flex items-center gap-2">
          <ArrowLeft className="h-4 w-4" />
          <span>Back to User Management</span>
        </Button>
      </Link>
      <div className="mt-4">
        <FeatureSummary
          pluralTitle={t('ws-ai-whitelist-emails.plural')}
          singularTitle={t('ws-ai-whitelist-emails.singular')}
          description={t('ws-ai-whitelist-emails.description')}
          createTitle={t('ws-ai-whitelist-emails.create')}
          createDescription={t('ws-ai-whitelist-emails.create_description')}
          form={<WhitelistEmailClient wsId={wsId} />}
        />
      </div>
      <Separator className="my-4" />

      <CustomDataTable
        data={emailData}
        columnGenerator={getNovaRoleColumns}
        count={emailCount}
      />
    </div>
  );
}

async function getWhitelistData(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
    retry = true,
  }: { q?: string; page?: string; pageSize?: string; retry?: boolean } = {}
) {
  const sbAdmin = await createAdminClient();
  if (!sbAdmin) notFound();

  const queryBuilder = sbAdmin
    .from('platform_email_roles')
    .select('email, enabled, created_at', {
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
    return getWhitelistData(wsId, { q, pageSize, retry: false });
  }

  return {
    emailData: data,
    emailCount: count,
  };
}
