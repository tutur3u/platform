import { getColumns } from '../columns';
import ModelForm from '../form';
import { CustomDataTable } from '@/components/custom-data-table';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getTranslations } from 'next-intl/server';

interface SearchParams {
  q?: string;
  page?: string;
  pageSize?: string;
  includedGroups?: string | string[];
  excludedGroups?: string | string[];
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
  const { data, count } = await getData(wsId, await searchParams);

  const pageSize = parseInt((await searchParams)?.pageSize || '50') || 50;

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-crawlers.plural')}
        singularTitle={t('ws-crawlers.singular')}
        description={t('ws-crawlers.description')}
        createTitle={t('ws-crawlers.create')}
        createDescription={t('ws-crawlers.create_description')}
        form={<ModelForm wsId={wsId} />}
      />
      <Separator className="my-4" />
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
    </>
  );
}

async function getData(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '50',
    retry = true,
  }: SearchParams & { retry?: boolean } = {}
) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || !user.email?.endsWith('@tuturuuu.com')) {
      throw new Error('Unauthorized');
    }

    const sbAdmin = await createAdminClient();

    const queryBuilder = sbAdmin
      .from('crawled_urls')
      .select('*', {
        count: 'exact',
      })
      .order('created_at');

    if (page && pageSize) {
      const parsedPage = parseInt(page);
      const parsedSize = parseInt(pageSize);
      const start = (parsedPage - 1) * parsedSize;
      const end = parsedPage * parsedSize;
      queryBuilder.range(start, end).limit(parsedSize);
    }

    const { data, error, count } = await queryBuilder;

    if (error) {
      console.error('Error fetching crawlers:', error);
      if (!retry) throw error;
      return getData(wsId, { q, pageSize, retry: false });
    }

    return {
      data,
      count: count ?? 0,
    };
  } catch (error) {
    console.error('Failed to fetch crawlers:', error);
    throw error;
  }
}
