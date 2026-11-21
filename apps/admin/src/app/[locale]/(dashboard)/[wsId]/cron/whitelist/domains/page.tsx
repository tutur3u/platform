import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { CustomDataTable } from '@/components/custom-data-table';
import { hasManagedCronAdminAccess } from '@/lib/managed-cron/authorization';
import { listManagedCronWhitelistedDomains } from '@/lib/managed-cron/domain-repository';
import ManagedCronWhitelistDomainClient from './domain-client-page';
import { getManagedCronWhitelistDomainColumns } from './domain-columns';

export const metadata: Metadata = {
  title: 'Managed Cron Domains',
  description:
    'Manage endpoint domains allowed for Tuturuuu-managed workspace cron jobs.',
};

interface SearchParams {
  page?: string;
  pageSize?: string;
  q?: string;
}

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<SearchParams>;
}

export default async function ManagedCronWhitelistDomainsPage({
  params,
  searchParams,
}: Props) {
  const t = await getTranslations();
  const { wsId } = await params;

  if (!(await hasManagedCronAdminAccess())) {
    notFound();
  }

  const { domainCount, domainData } = await getDomainData(await searchParams);

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-managed-cron-whitelist-domains.plural')}
        singularTitle={t('ws-managed-cron-whitelist-domains.singular')}
        description={t('ws-managed-cron-whitelist-domains.description')}
        createTitle={t('ws-managed-cron-whitelist-domains.create')}
        createDescription={t(
          'ws-managed-cron-whitelist-domains.create_description'
        )}
        form={<ManagedCronWhitelistDomainClient wsId={wsId} />}
      />
      <Separator className="my-4" />
      <CustomDataTable
        data={domainData}
        columnGenerator={getManagedCronWhitelistDomainColumns}
        count={domainCount}
        defaultVisibility={{
          created_at: false,
        }}
      />
    </>
  );
}

async function getDomainData({
  page = '1',
  pageSize = '10',
  q,
}: {
  page?: string;
  pageSize?: string;
  q?: string;
} = {}) {
  const { count, data } = await listManagedCronWhitelistedDomains({
    page,
    pageSize,
    q,
  });

  return {
    domainCount: count,
    domainData: data,
  };
}
