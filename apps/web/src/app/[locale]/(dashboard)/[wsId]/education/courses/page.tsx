import { getWorkspaceCourseColumns } from './columns';
//import { mockData } from './mock/mock-courses';
import { CustomDataTable } from '@/components/custom-data-table';
import { createClient } from '@tuturuuu/supabase/next/server';
import { WorkspaceCourse } from '@tuturuuu/types/db';
import { CourseCardView } from '@tuturuuu/ui/custom/education/courses/course-card-view';
import { CourseForm } from '@tuturuuu/ui/custom/education/courses/course-form';
import { CoursePagination } from '@tuturuuu/ui/custom/education/courses/course-pagination';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { ViewToggle } from '@tuturuuu/ui/custom/view-toggle';
import { Separator } from '@tuturuuu/ui/separator';
import { getTranslations } from 'next-intl/server';

interface SearchParams {
  q?: string;
  page?: string;
  pageSize?: string;
  includedTags?: string | string[];
  excludedTags?: string | string[];
  view?: 'card' | 'table';
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
  const searchParamsResolved = await searchParams;
  const { page = '1', pageSize = '10' } = searchParamsResolved;

  const { data, count } = await getData(wsId, searchParamsResolved);
  const currentView = searchParamsResolved.view || 'card';
  const currentPage = parseInt(page);
  const currentPageSize = parseInt(pageSize);
  const totalPages = Math.ceil(count / currentPageSize);

  const courses = data.map((c) => ({
    ...c,
    ws_id: wsId,
    href: `/${wsId}/education/courses/${c.id}`,
  }));

  return (
    <>
      <div className="p-4">
        <FeatureSummary
          pluralTitle={t('ws-courses.plural')}
          singularTitle={t('ws-courses.singular')}
          description={t('ws-courses.description')}
          createTitle={t('ws-courses.create')}
          createDescription={t('ws-courses.create_description')}
          form={<CourseForm wsId={wsId} />}
        />
        <Separator className="my-4" />

        <div className="mb-4 flex justify-end">
          <ViewToggle currentView={currentView} />
        </div>

        {currentView === 'card' ? (
          <>
            <CourseCardView courses={courses} />
            <div className="mt-8">
              <CoursePagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalCount={count}
                pageSize={currentPageSize}
                wsId={wsId}
              />
            </div>
          </>
        ) : (
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
        )}
      </div>
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
  // if (process.env.NODE_ENV === 'development') {
  //   // Placing mock data for testing
  //   const allMock: WorkspaceCourse[] = mockData();

  //   const filteredData = allMock.filter((course) =>
  //     q ? course.name.toLowerCase().includes(q.toLowerCase()) : true
  //   );

  //   const parsedPage = parseInt(page);
  //   const parsedSize = parseInt(pageSize);
  //   const start = (parsedPage - 1) * parsedSize;
  //   const end = parsedPage * parsedSize;
  //   const paginatedData = filteredData.slice(start, end);

  //   return {
  //     data: paginatedData,
  //     count: filteredData.length,
  //   };
  // }

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
  } as { data: (WorkspaceCourse & { modules: number })[]; count: number };
}
