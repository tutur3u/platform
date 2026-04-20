import { GraduationCap, Plus, Sparkles } from '@tuturuuu/icons';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceCourse } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import { CourseCardView } from '@tuturuuu/ui/custom/education/courses/course-card-view';
import { CourseForm } from '@tuturuuu/ui/custom/education/courses/course-form';
import { CoursePagination } from '@tuturuuu/ui/custom/education/courses/course-pagination';
import ModifiableDialogTrigger from '@tuturuuu/ui/custom/modifiable-dialog-trigger';
import { ViewToggle } from '@tuturuuu/ui/custom/view-toggle';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CustomDataTable } from '@/components/custom-data-table';
import { resolveRouteWorkspace } from '@/lib/resolve-route-workspace';
import { getWorkspaceCourseColumns } from './columns';

export const metadata: Metadata = {
  title: 'Courses',
  description:
    'Manage Courses in the Education area of your Tuturuuu workspace.',
};

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
  const { wsId: routeWsId } = await params;
  const { resolvedWsId } = await resolveRouteWorkspace(routeWsId);
  const searchParamsResolved = await searchParams;
  const { page = '1', pageSize = '10' } = searchParamsResolved;

  const { data, count } = await getData(resolvedWsId, searchParamsResolved);
  const currentView = searchParamsResolved.view || 'card';
  const currentPage = parseInt(page, 10);
  const currentPageSize = parseInt(pageSize, 10);
  const totalPages = Math.ceil(count / currentPageSize);

  const courses = data.map((c) => ({
    ...c,
    ws_id: resolvedWsId,
    href: `/${routeWsId}/education/courses/${c.id}/builder`,
  }));

  return (
    <div className="space-y-6 p-4">
      <section className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-card/95 p-5 shadow-sm sm:p-6">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-0 -left-8 h-40 w-40 rounded-full bg-dynamic-blue/10 blur-3xl" />
          <div className="absolute right-0 bottom-0 h-40 w-40 rounded-full bg-dynamic-purple/10 blur-3xl" />
          <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-foreground/15 to-transparent" />
        </div>

        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-dynamic-purple/20 bg-dynamic-purple/10 px-3 py-1 font-medium text-dynamic-purple text-xs">
              <Sparkles className="h-3.5 w-3.5" />
              {t('ws-courses.plural')}
            </div>

            <div className="flex items-start gap-4">
              <div className="hidden rounded-[1.4rem] border border-dynamic-blue/20 bg-linear-to-br from-dynamic-blue/15 to-dynamic-purple/10 p-4 shadow-sm sm:flex">
                <GraduationCap className="h-8 w-8 text-dynamic-blue" />
              </div>

              <div className="space-y-3">
                <h1 className="font-semibold text-3xl tracking-tight sm:text-4xl">
                  {t('ws-courses.plural')}
                </h1>
                <p className="max-w-2xl text-base text-foreground/70 leading-7">
                  {t('ws-courses.description')}
                </p>
                <div className="flex flex-wrap gap-2.5">
                  <div className="rounded-full border border-dynamic-blue/20 bg-dynamic-blue/10 px-3 py-1.5 text-dynamic-blue text-sm">
                    <span className="font-semibold">{count}</span>{' '}
                    {t('ws-courses.plural')}
                  </div>
                  <div className="rounded-full border border-dynamic-green/20 bg-dynamic-green/10 px-3 py-1.5 text-dynamic-green text-sm">
                    <span className="font-semibold">{currentPageSize}</span>{' '}
                    {currentView === 'card'
                      ? t('ws-courses.card_view')
                      : t('ws-courses.table_view')}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <ViewToggle currentView={currentView} />
            <ModifiableDialogTrigger
              title={t('ws-courses.singular')}
              createDescription={t('ws-courses.create_description')}
              form={<CourseForm wsId={resolvedWsId} />}
              trigger={
                <Button className="h-11 rounded-2xl bg-foreground px-5 text-background shadow-sm transition-transform hover:-translate-y-0.5 hover:bg-foreground/90">
                  <Plus className="h-4 w-4" />
                  {t('ws-courses.create')}
                </Button>
              }
            />
          </div>
        </div>
      </section>

      {currentView === 'card' ? (
        <>
          <div className="relative overflow-hidden rounded-[2rem] border border-border/60 bg-card/65 p-3 shadow-sm backdrop-blur-sm sm:p-4">
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--foreground)/0.04)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--foreground)/0.04)_1px,transparent_1px)] bg-[size:24px_24px] opacity-25" />
            <div className="relative">
              <CourseCardView courses={courses} />
            </div>
          </div>
          <div className="mt-8">
            <CoursePagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalCount={count}
              pageSize={currentPageSize}
              wsId={routeWsId}
            />
          </div>
        </>
      ) : (
        <div className="overflow-hidden rounded-[2rem] border border-border/60 bg-card/80 p-3 shadow-sm backdrop-blur-sm">
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
        </div>
      )}
    </div>
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

  const supabase = await createAdminClient();

  const queryBuilder = supabase
    .from('workspace_courses')
    .select('*, workspace_course_modules(id.count())', {
      count: 'exact',
    })
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false });

  if (q) queryBuilder.ilike('name', `%${q}%`);

  if (page && pageSize) {
    const parsedPage = parseInt(page, 10);
    const parsedSize = parseInt(pageSize, 10);
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
