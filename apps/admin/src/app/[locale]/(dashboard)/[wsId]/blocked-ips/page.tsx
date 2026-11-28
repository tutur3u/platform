import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { CustomDataTable } from '@/components/custom-data-table';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { listIpBlocks } from '@/lib/infrastructure/ip-block-store';
import { authorizeIpOperator } from '@/lib/infrastructure/ip-operator';
import AddBlockedIPDialog from './add-blocked-ip-dialog';
import { getBlockedIPsColumns } from './columns';
import Filters from './filters';
import {
  BlockedIpSearchParamsSchema,
  shouldApplyBlockedIpStatusFilter,
} from './search-params';

export const metadata: Metadata = {
  title: 'Blocked IPs',
  description: 'Manage blocked IP addresses for abuse prevention.',
};

interface SearchParams {
  q?: string;
  page?: number;
  pageSize?: number;
  status?: string;
}

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
  searchParams: Promise<SearchParams>;
}

export default async function BlockedIPsPage({ params, searchParams }: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ locale }) => {
        const t = await getTranslations();

        const auth = await authorizeIpOperator(
          new Request(
            'https://infrastructure.tuturuuu.com/api/v1/infrastructure/blocked-ips',
            {
              headers: await headers(),
            }
          )
        );
        if (!auth.ok) notFound();

        const sp = BlockedIpSearchParamsSchema.parse(await searchParams);
        const { data, count } = await listIpBlocks(auth.sbAdmin, {
          ...sp,
          status: shouldApplyBlockedIpStatusFilter(sp.status)
            ? sp.status
            : undefined,
        });

        return (
          <>
            <FeatureSummary
              pluralTitle={t('blocked-ips.plural')}
              singularTitle={t('blocked-ips.singular')}
              description={t('blocked-ips.description')}
            />
            <Separator className="my-4" />
            <CustomDataTable
              data={data}
              namespace="blocked-ips-data-table"
              columnGenerator={getBlockedIPsColumns}
              extraData={{
                locale,
              }}
              count={count}
              defaultVisibility={{
                id: false,
                created_at: false,
                updated_at: false,
                metadata: false,
              }}
              filters={
                <div className="flex items-center justify-between gap-2">
                  <Filters />
                  <AddBlockedIPDialog />
                </div>
              }
            />
          </>
        );
      }}
    </WorkspaceWrapper>
  );
}
