import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { CustomDataTable } from '@/components/custom-data-table';
import { hasAIWhitelistAccess } from '@/lib/ai-whitelist/authorization';
import { listAIWhitelistEmails } from '@/lib/ai-whitelist/email-repository';
import WhitelistEmailClient from './client-page';
import { getAIWhitelistEmailColumns } from './columns';

export const metadata: Metadata = {
  title: 'Emails',
  description:
    'Manage Emails in the Whitelist area of your Tuturuuu workspace.',
};

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
  await connection();

  const t = await getTranslations();
  const { wsId } = await params;

  if (!(await hasAIWhitelistAccess())) {
    notFound();
  }

  const { emailData, emailCount } = await getEmailData(await searchParams);

  return (
    <Tabs defaultValue="emails">
      <TabsList>
        <Link href={`/${wsId}/ai/whitelist/emails`}>
          <TabsTrigger value="emails">
            {t('ws-ai-whitelist-emails.plural')}
          </TabsTrigger>
        </Link>
        <Link href={`/${wsId}/ai/whitelist/domains`}>
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

async function getEmailData({
  q,
  page = '1',
  pageSize = '10',
}: {
  q?: string;
  page?: string;
  pageSize?: string;
} = {}) {
  const { data, count } = await listAIWhitelistEmails({ page, pageSize, q });

  return {
    emailData: data,
    emailCount: count,
  };
}
