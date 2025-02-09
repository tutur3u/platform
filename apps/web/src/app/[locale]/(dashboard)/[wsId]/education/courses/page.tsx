import { getWorkspaceCourseColumns } from './columns';
import CourseForm from './form';
import { CustomDataTable } from '@/components/custom-data-table';
import { createClient } from '@tutur3u/supabase/next/server';
import { WorkspaceCourse } from '@repo/types/db';
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

  const courses = data.map((c) => ({
    ...c,
    ws_id: wsId,
    href: `/${wsId}/education/courses/${c.id}`,
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
        data={courses}
        columnGenerator={getWorkspaceCourseColumns}
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
    .select('*, workspace_course_modules(id.count())', {
      count: 'exact',
    })
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false });

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

  return {
    data: data.map(({ workspace_course_modules, ...rest }) => ({
      ...rest,
      modules: workspace_course_modules?.[0]?.count || 0,
    })),
    count,
  } as { data: WorkspaceCourse[]; count: number };
}
