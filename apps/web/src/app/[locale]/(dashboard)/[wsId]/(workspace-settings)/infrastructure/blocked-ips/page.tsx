import { createClient } from '@tuturuuu/supabase/next/server';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import type { IPBlockStatus } from '@tuturuuu/utils/abuse-protection';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { CustomDataTable } from '@/components/custom-data-table';
import { getBlockedIPsColumns } from './columns';
import Filters from './filters';
import AddBlockedIPDialog from './add-blocked-ip-dialog';
import WorkspaceWrapper from '@/components/workspace-wrapper';

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

const SearchParamsSchema = z.object({
  q: z.string().default(''),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  status: z
    .enum(['active', 'expired', 'manually_unblocked', ''])
    .default('active'),
});

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
      {async ({ wsId, locale }) => {
        const t = await getTranslations();

        const { containsPermission } = await getPermissions({ wsId });
        const canViewInfrastructure = containsPermission('view_infrastructure');
        if (!canViewInfrastructure) {
          notFound();
        }

        const sp = SearchParamsSchema.parse(await searchParams);

        const { data, count } = await getData(sp);

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

async function getData({
  q,
  page = 1,
  pageSize = 10,
  status,
  retry = true,
}: SearchParams & { retry?: boolean } = {}) {
  const supabase = await createClient();

  let queryBuilder = supabase
    .from('blocked_ips')
    .select(
      `
      *,
      unblocked_by_user:unblocked_by (
        id,
        display_name
      )
    `,
      {
        count: 'exact',
      }
    )
    .order('blocked_at', { ascending: false });

  // Filter by status if provided
  if (status && status !== '') {
    queryBuilder = queryBuilder.eq('status', status as IPBlockStatus);
  }

  // Search filter
  if (q) {
    queryBuilder = queryBuilder.or(
      `ip_address.ilike.%${q}%,reason.ilike.%${q}%`
    );
  }

  // Pagination
  if (page && pageSize) {
    const start = (page - 1) * pageSize;
    const end = start + pageSize - 1;
    queryBuilder = queryBuilder.range(start, end);
  }

  const { data, error, count } = await queryBuilder;

  if (error) {
    if (!retry) throw error;
    return getData({
      q,
      page,
      pageSize,
      status,
      retry: false,
    });
  }

  return {
    data: data || [],
    count: count || 0,
  };
}
