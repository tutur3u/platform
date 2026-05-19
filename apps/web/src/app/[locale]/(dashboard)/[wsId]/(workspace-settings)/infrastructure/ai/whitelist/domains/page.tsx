import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { CustomDataTable } from '@/components/custom-data-table';
import { hasAIWhitelistAccess } from '@/lib/ai-whitelist/authorization';
import { listAIWhitelistDomains } from '@/lib/ai-whitelist/domain-repository';
import WhitelistDomainClient from '../domains/domain-client-page';
import { getAIWhitelistDomainColumns } from '../domains/domain-columns';

export const metadata: Metadata = {
  title: 'Domains',
  description:
    'Manage Domains in the Whitelist area of your Tuturuuu workspace.',
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
  const t = await getTranslations();
  const { wsId } = await params;

  if (!(await hasAIWhitelistAccess())) {
    notFound();
  }

  const { domainData, domainCount } = await getDomainData(await searchParams);

  return (
    <Tabs defaultValue="domains">
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

      <TabsContent value="domains">
        <FeatureSummary
          pluralTitle={t('ws-ai-whitelist-domains.plural')}
          singularTitle={t('ws-ai-whitelist-domains.singular')}
          description={t('ws-ai-whitelist-domains.description')}
          createTitle={t('ws-ai-whitelist-domains.create')}
          createDescription={t('ws-ai-whitelist-domains.create_description')}
          form={<WhitelistDomainClient wsId={wsId} />}
        />
        <Separator className="my-4" />
        <CustomDataTable
          data={domainData}
          columnGenerator={getAIWhitelistDomainColumns}
          count={domainCount}
          defaultVisibility={{
            id: false,
            created_at: false,
          }}
        />
      </TabsContent>
    </Tabs>
  );
}

async function getDomainData({
  q,
  page = '1',
  pageSize = '10',
}: {
  q?: string;
  page?: string;
  pageSize?: string;
} = {}) {
  const { data, count } = await listAIWhitelistDomains({ page, pageSize, q });

  return {
    domainData: data,
    domainCount: count,
  };
}
