import WhitelistEmailClient from './client-page';
import { getAIWhitelistEmailColumns } from './columns';
import { CustomDataTable } from '@/components/custom-data-table';
import { createAdminClient } from '@repo/supabase/next/server';
import FeatureSummary from '@repo/ui/components/ui/custom/feature-summary';
import { Separator } from '@repo/ui/components/ui/separator';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@repo/ui/components/ui/tabs';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
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
    <Tabs defaultValue="emails">
      <TabsList>
        <Link href={`/${wsId}/infrastructure/ai/whitelist/emails`}>
          <TabsTrigger value="emails">
            {t('ws-ai-whitelist-emails.plural')}
          </TabsTrigger>
        </Link>
        <Link href={`/${wsId}/infrastructure/ai/whitelist/domains`}>
          <TabsTrigger value="domains">
            {t('ws-ai-whitelist-domains.plural')}
          </TabsTrigger>
        </Link>
      </TabsList>

      <TabsContent value="emails">
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
          columnGenerator={getAIWhitelistEmailColumns}
          count={emailCount}
          defaultVisibility={{
            id: false,
            created_at: false,
          }}
        />
      </TabsContent>
    </Tabs>
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
    .from('ai_whitelisted_emails')
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
