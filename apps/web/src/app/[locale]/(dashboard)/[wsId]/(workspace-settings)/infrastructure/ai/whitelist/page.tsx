import { getAIWhitelistEmailColumns } from './columns';
import { CustomDataTable } from '@/components/custom-data-table';
import { createAdminClient } from '@/utils/supabase/server';
import FeatureSummary from '@repo/ui/components/ui/custom/feature-summary';
import { Separator } from '@repo/ui/components/ui/separator';
import { getTranslations } from 'next-intl/server';
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

export default async function WorkspaceCoursesPage({
  params,
  searchParams,
}: Props) {
  const t = await getTranslations();
  const { wsId } = await params;

  const { data: emails, count } = await getData(wsId, await searchParams);

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-courses.plural')}
        singularTitle={t('ws-courses.singular')}
        description={t('ws-courses.description')}
        createTitle={t('ws-courses.create')}
        createDescription={t('ws-courses.create_description')}
        // form={<CourseForm wsId={wsId} />}
      />
      <Separator className="my-4" />
      <CustomDataTable
        data={emails}
        columnGenerator={getAIWhitelistEmailColumns}
        count={count}
        defaultVisibility={{
          id: false,
          created_at: false,
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
    return getData(wsId, { q, pageSize, retry: false });
  }

  return {
    data,
    count,
  };
}
