import { getColumns } from '../columns';
import ModelForm from '../form';
import UncrawledUrlsCount from '../uncrawled-urls-count';
import CrawlerFilters from './crawler-filters';
import { CustomDataTable } from '@/components/custom-data-table';
import {
  createAdminClient,
  createClient,
} from '@ncthub/supabase/next/server';
import { Card, CardContent, CardHeader, CardTitle } from '@ncthub/ui/card';
import FeatureSummary from '@ncthub/ui/custom/feature-summary';
import { getTranslations } from 'next-intl/server';

interface SearchParams {
  q?: string;
  page?: string;
  pageSize?: string;
  domain?: string;
  search?: string;
}

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
  searchParams: Promise<SearchParams>;
}

export default async function CrawledUrlsPage({ params, searchParams }: Props) {
  const t = await getTranslations();
  const { locale, wsId } = await params;

  const awaitedSearchParams = await searchParams;

  const page = parseInt(awaitedSearchParams.page || '1') || 1;
  const pageSize = parseInt(awaitedSearchParams.pageSize || '50') || 50;
  const domain = awaitedSearchParams.domain;
  const search = awaitedSearchParams.search;

  const { data, count } = await getCrawledUrls({
    page,
    pageSize,
    domain,
    search,
  });

  return (
    <div className="space-y-8">
      <FeatureSummary
        pluralTitle={t('ws-crawlers.plural')}
        singularTitle={t('ws-crawlers.singular')}
        description={t('ws-crawlers.description')}
        createTitle={t('ws-crawlers.create')}
        createDescription={t('ws-crawlers.create_description')}
        form={<ModelForm wsId={wsId} />}
      />

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Quick Stats</CardTitle>
          </CardHeader>
          <CardContent>
            <UncrawledUrlsCount wsId={wsId} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Crawled URLs ({count})</CardTitle>
            <CrawlerFilters wsId={wsId} />
          </CardHeader>
          <CardContent>
            <CustomDataTable
              data={data}
              namespace="crawled-url-data-table"
              columnGenerator={getColumns}
              extraData={{ locale, wsId }}
              count={count}
              pageSize={pageSize}
              defaultVisibility={{
                id: false,
              }}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const getCrawledUrls = async ({
  page,
  pageSize,
  domain,
  search,
}: {
  page?: number;
  pageSize?: number;
  domain?: string;
  search?: string;
}) => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email?.endsWith('@tuturuuu.com')) {
    throw new Error('Unauthorized');
  }

  const sbAdmin = await createAdminClient();

  // Build main query
  const queryBuilder = sbAdmin
    .from('crawled_urls')
    .select('*', {
      count: 'exact',
    })
    .order('created_at', { ascending: false });

  // Apply filters
  if (domain && domain !== 'all') {
    // Use hostname check for more accurate domain filtering
    try {
      const domainHost = new URL(`http://${domain}`).hostname;
      queryBuilder.filter('url', 'ilike', `%${domainHost}%`);
    } catch {
      // Fallback to simple string matching if domain is invalid
      queryBuilder.ilike('url', `%${domain}%`);
    }
  }

  if (search) {
    queryBuilder.or(
      `url.ilike.%${search}%,markdown.ilike.%${search}%,html.ilike.%${search}%`
    );
  }

  // Apply pagination
  if (page && pageSize) {
    const start = (page - 1) * pageSize;
    const end = page * pageSize - 1;
    queryBuilder.range(start, end);
  }

  const { data, error, count } = await queryBuilder;

  if (error) throw error;

  return {
    data,
    count: count ?? 0,
  };
};
