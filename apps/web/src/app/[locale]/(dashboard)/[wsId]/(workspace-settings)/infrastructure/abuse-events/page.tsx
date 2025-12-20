import { createClient } from '@tuturuuu/supabase/next/server';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import type { AbuseEventType } from '@tuturuuu/utils/abuse-protection';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { CustomDataTable } from '@/components/custom-data-table';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { getAbuseEventsColumns } from './columns';
import Filters from './filters';

export const metadata: Metadata = {
  title: 'Abuse Events',
  description: 'View abuse events for security monitoring.',
};

interface SearchParams {
  q?: string;
  page?: number;
  pageSize?: number;
  type?: string;
  success?: string;
}

const SearchParamsSchema = z.object({
  q: z.string().default(''),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  type: z.string().default(''),
  success: z.string().default(''),
});

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
  searchParams: Promise<SearchParams>;
}

export default async function AbuseEventsPage({ params, searchParams }: Props) {
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
              pluralTitle={t('abuse-events.plural')}
              singularTitle={t('abuse-events.singular')}
              description={t('abuse-events.description')}
            />
            <Separator className="my-4" />
            <CustomDataTable
              data={data}
              namespace="abuse-events-data-table"
              columnGenerator={getAbuseEventsColumns}
              extraData={{
                locale,
              }}
              count={count}
              defaultVisibility={{
                id: false,
                email_hash: false,
                user_agent: false,
                metadata: false,
              }}
              filters={<Filters />}
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
  pageSize = 50,
  type,
  success,
  retry = true,
}: SearchParams & { retry?: boolean } = {}) {
  const supabase = await createClient();

  let queryBuilder = supabase
    .from('abuse_events')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  // Filter by event type
  if (type && type !== '') {
    queryBuilder = queryBuilder.eq('event_type', type as AbuseEventType);
  }

  // Filter by success
  if (success === 'true') {
    queryBuilder = queryBuilder.eq('success', true);
  } else if (success === 'false') {
    queryBuilder = queryBuilder.eq('success', false);
  }

  // Search filter (IP address)
  if (q) {
    queryBuilder = queryBuilder.ilike('ip_address', `%${q}%`);
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
      type,
      success,
      retry: false,
    });
  }

  return {
    data: data || [],
    count: count || 0,
  };
}
