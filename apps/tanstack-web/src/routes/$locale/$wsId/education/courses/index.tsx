import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { GraduationCap, Plus, Sparkles } from '@tuturuuu/icons';
import {
  type ListWorkspaceCoursesResponse,
  listWorkspaceCourses,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import type { WorkspaceCourse } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import { CourseCardView } from '@tuturuuu/ui/custom/education/courses/course-card-view';
import { CourseForm } from '@tuturuuu/ui/custom/education/courses/course-form';
import { CoursePagination } from '@tuturuuu/ui/custom/education/courses/course-pagination';
import ModifiableDialogTrigger from '@tuturuuu/ui/custom/modifiable-dialog-trigger';
import { CustomDataTable } from '@tuturuuu/ui/custom/tables/custom-data-table';
import { ViewToggle } from '@tuturuuu/ui/custom/view-toggle';
import type { ComponentProps } from 'react';
import { useTranslations } from 'use-intl';
import { getWorkspaceCourseColumns } from '@/components/education/courses/columns';
import { requireCurrentUser } from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { resolveWorkspace } from '@/lib/platform/workspace';

type CoursesView = 'card' | 'table';

type CoursesData = {
  count: number;
  courses: ListWorkspaceCoursesResponse['data'];
  page: number;
  pageSize: number;
  view: CoursesView;
  workspaceId: string;
};

type CoursesSearch = {
  page?: number;
  pageSize?: number;
  q?: string;
  view?: CoursesView;
};

function toPositiveInt(value: unknown): number | undefined {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

const loadCourses = createServerFn({ method: 'GET' })
  .validator(
    (data: { wsId: string; page?: number; pageSize?: number; q?: string }) =>
      data
  )
  .handler(
    async ({
      data,
    }): Promise<{ data: CoursesData['courses']; count: number }> => {
      const result = await listWorkspaceCourses(
        data.wsId,
        { page: data.page, pageSize: data.pageSize, q: data.q, status: 'all' },
        withForwardedInternalApiAuth(getRequestHeaders())
      );

      return { count: result.count, data: result.data };
    }
  );

export const Route = createFileRoute('/$locale/$wsId/education/courses/')({
  component: CoursesRoutePage,
  // Pass-through query keys (view/page/pageSize/q): ViewToggle, CoursePagination
  // and CustomDataTable read them from the URL via the next/navigation shim.
  validateSearch: (search: Record<string, unknown>): CoursesSearch => ({
    page: toPositiveInt(search.page),
    pageSize: toPositiveInt(search.pageSize),
    q: typeof search.q === 'string' ? search.q : undefined,
    view: search.view === 'table' ? 'table' : 'card',
  }),
  loaderDeps: ({ search }) => ({
    page: search.page,
    pageSize: search.pageSize,
    q: search.q,
    view: search.view,
  }),
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: 'Manage courses in your Tuturuuu workspace education area.',
      locale,
      title: 'Courses',
    });
  },
  loader: async ({ params, deps }): Promise<CoursesData> => {
    // Auth gate FIRST, fail closed.
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/education/courses`,
    });

    // Legacy resolveRouteWorkspace -> notFound when the workspace is missing.
    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists) {
      throw notFound();
    }

    const page = deps.page ?? 1;
    const pageSize = deps.pageSize ?? 10;
    const { count, data } = await loadCourses({
      data: { wsId: workspace.workspaceId, page, pageSize, q: deps.q },
    });

    return {
      count,
      courses: data,
      page,
      pageSize,
      view: deps.view === 'table' ? 'table' : 'card',
      workspaceId: workspace.workspaceId,
    };
  },
});

function CoursesRoutePage() {
  const data = Route.useLoaderData() as CoursesData | undefined;
  const { wsId } = Route.useParams();
  const t = useTranslations('ws-courses');

  if (!data) {
    throw notFound();
  }

  const totalPages = Math.ceil(data.count / data.pageSize);
  const courses = data.courses.map((course) => ({
    ...course,
    modules: course.modules_count,
    ws_id: data.workspaceId,
    href: `/${wsId}/education/courses/${course.id}/builder`,
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
              {t('plural')}
            </div>

            <div className="flex items-start gap-4">
              <div className="hidden rounded-[1.4rem] border border-dynamic-blue/20 bg-linear-to-br from-dynamic-blue/15 to-dynamic-purple/10 p-4 shadow-sm sm:flex">
                <GraduationCap className="h-8 w-8 text-dynamic-blue" />
              </div>

              <div className="space-y-3">
                <h1 className="font-semibold text-3xl tracking-tight sm:text-4xl">
                  {t('plural')}
                </h1>
                <p className="max-w-2xl text-base text-foreground/70 leading-7">
                  {t('description')}
                </p>
                <div className="flex flex-wrap gap-2.5">
                  <div className="rounded-full border border-dynamic-blue/20 bg-dynamic-blue/10 px-3 py-1.5 text-dynamic-blue text-sm">
                    <span className="font-semibold">{data.count}</span>{' '}
                    {t('plural')}
                  </div>
                  <div className="rounded-full border border-dynamic-green/20 bg-dynamic-green/10 px-3 py-1.5 text-dynamic-green text-sm">
                    <span className="font-semibold">{data.pageSize}</span>{' '}
                    {data.view === 'card' ? t('card_view') : t('table_view')}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <ViewToggle currentView={data.view} />
            <ModifiableDialogTrigger
              title={t('singular')}
              createDescription={t('create_description')}
              form={<CourseForm wsId={data.workspaceId} />}
              trigger={
                <Button className="h-11 rounded-2xl bg-foreground px-5 text-background shadow-sm transition-transform hover:-translate-y-0.5 hover:bg-foreground/90">
                  <Plus className="h-4 w-4" />
                  {t('create')}
                </Button>
              }
            />
          </div>
        </div>
      </section>

      {data.view === 'card' ? (
        <>
          <div className="relative overflow-hidden rounded-[2rem] border border-border/60 bg-card/65 p-3 shadow-sm backdrop-blur-sm sm:p-4">
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--foreground)/0.04)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--foreground)/0.04)_1px,transparent_1px)] bg-[size:24px_24px] opacity-25" />
            <div className="relative">
              <CourseCardView
                courses={
                  courses as unknown as ComponentProps<
                    typeof CourseCardView
                  >['courses']
                }
              />
            </div>
          </div>
          <div className="mt-8">
            <CoursePagination
              currentPage={data.page}
              totalPages={totalPages}
              totalCount={data.count}
              pageSize={data.pageSize}
              wsId={wsId}
            />
          </div>
        </>
      ) : (
        <div className="overflow-hidden rounded-[2rem] border border-border/60 bg-card/80 p-3 shadow-sm backdrop-blur-sm">
          <CustomDataTable
            data={courses as unknown as WorkspaceCourse[]}
            columnGenerator={getWorkspaceCourseColumns}
            namespace="course-data-table"
            count={data.count}
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
