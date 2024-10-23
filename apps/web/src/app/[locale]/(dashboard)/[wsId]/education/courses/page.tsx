import { getUserGroupColumns } from './columns';
import CourseForm from './form';
import { CustomDataTable } from '@/components/custom-data-table';
import { UserGroup } from '@/types/primitives/UserGroup';
import { createClient } from '@/utils/supabase/server';
import FeatureSummary from '@repo/ui/components/ui/custom/feature-summary';
import { Separator } from '@repo/ui/components/ui/separator';
import { getTranslations } from 'next-intl/server';

interface SearchParams {
  q?: string;
  page?: string;
  pageSize?: string;
  includedTags?: string | string[];
  excludedTags?: string | string[];
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

  const { data, count } = await getData(wsId, await searchParams);

  const groups = data.map((g) => ({
    ...g,
    ws_id: wsId,
    href: `/${wsId}/users/groups/${g.id}`,
  }));

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-courses.plural')}
        singularTitle={t('ws-courses.singular')}
        description={t('ws-courses.description')}
        createTitle={t('ws-courses.create')}
        createDescription={t('ws-courses.create_description')}
        form={<CourseForm wsId={wsId} />}
      />
      <Separator className="my-4" />
      <CustomDataTable
        data={groups}
        columnGenerator={getUserGroupColumns}
        namespace="course-data-table"
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
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('workspace_courses')
    .select('*', {
      count: 'exact',
    })
    .eq('ws_id', wsId)
    .order('name');

  if (q) queryBuilder.ilike('name', `%${q}%`);

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

  return { data, count } as { data: UserGroup[]; count: number };
}
