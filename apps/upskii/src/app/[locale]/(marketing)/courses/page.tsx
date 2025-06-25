import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceCourse } from '@tuturuuu/types/db';
import { CourseCardView } from '@tuturuuu/ui/custom/education/courses/course-card-view';
import { CoursePagination } from '@tuturuuu/ui/custom/education/courses/course-pagination';
import { getTranslations } from 'next-intl/server';

interface SearchParams {
  q?: string;
  page?: string;
  pageSize?: string;
}

interface Props {
  searchParams: Promise<SearchParams>;
}

export default async function PublicCoursesPage({ searchParams }: Props) {
  const t = await getTranslations();
  const searchParamsResolved = await searchParams;
  const { page = '1', pageSize = '12', q } = searchParamsResolved;

  const validatedPage = Math.max(1, parseInt(page) || 1);
  const validatedPageSize = Math.min(
    100,
    Math.max(1, parseInt(pageSize) || 12)
  );
  const { data, count } = await getData({
    q,
    page: validatedPage.toString(),
    pageSize: validatedPageSize.toString(),
  });
  const currentPage = validatedPage;
  const currentPageSize = validatedPageSize;
  const totalPages = Math.ceil(count / currentPageSize);

  const courses = data.map((c) => ({
    ...c,
    ws_id: c.ws_id || '',
    href: `/courses/${c.id}`,
  }));

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header Section */}
      <div className="mb-8 text-center">
        <h1 className="mb-4 text-4xl font-bold text-gray-900 dark:text-gray-100">
          {t('ws-courses.plural')}
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          {t('courses-marketplace-description')}
        </p>
      </div>

      {/* Courses Grid */}
      <CourseCardView courses={courses} />

      {/* Pagination */}
      <div className="mt-8">
        <CoursePagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalCount={count}
          pageSize={currentPageSize}
        />
      </div>
    </div>
  );
}

// Get ALL courses that are published, include pagination data
async function getData({
  q,
  page = '1',
  pageSize = '10',
  retry = true,
}: {
  q?: string;
  page?: string;
  pageSize?: string;
  retry?: boolean;
} = {}) {
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

  const supabase = await createAdminClient();

  const queryBuilder = supabase
    .from('workspace_courses')
    .select('*, workspace_course_modules(id.count())', {
      count: 'exact',
    })
    .eq('is_published', true)
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
    return getData({ q, pageSize, retry: false });
  }

  return {
    data: data.map(({ workspace_course_modules, ...rest }) => ({
      ...rest,
      modules: workspace_course_modules?.[0]?.count || 0,
    })),
    count,
  } as { data: (WorkspaceCourse & { modules: number })[]; count: number };
}
