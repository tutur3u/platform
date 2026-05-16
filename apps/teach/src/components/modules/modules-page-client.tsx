'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BookOpenCheck, GraduationCap } from '@tuturuuu/icons';
import {
  archiveWorkspaceCourse,
  createWorkspaceCourse,
  listWorkspaceCourses,
  publishWorkspaceCourse,
  type WorkspaceCourseListItem,
} from '@tuturuuu/internal-api';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { CourseCreatePanel } from './course-create-panel';
import { CourseGroupCard } from './course-group-card';
import { ModulesEmptyState, ModulesLoadingState } from './modules-shared';

// ─── Page header ──────────────────────────────────────────────────────────────

function ModulesPageHeader({
  wsId,
  workspaceName,
}: {
  wsId: string;
  workspaceName: string | null;
}) {
  const t = useTranslations();

  return (
    <div className="border-2 border-border bg-background p-6 shadow-[8px_8px_0_var(--border)] md:p-8">
      <Link
        href={`/${wsId}`}
        className="mb-5 inline-flex items-center gap-2 border-2 border-border bg-card px-3 py-1.5 font-bold text-sm shadow-[2px_2px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[3px_3px_0_var(--border)]"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('teachModules.backToDashboard')}
      </Link>

      <div className="flex items-start gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center border-2 border-border bg-dynamic-cyan/15 shadow-[4px_4px_0_var(--border)]">
          <BookOpenCheck className="h-7 w-7" />
        </span>
        <div>
          <p className="mb-2 inline-flex border-2 border-border bg-dynamic-yellow/15 px-3 py-1 font-black text-xs shadow-[3px_3px_0_var(--border)]">
            <GraduationCap className="mr-1.5 h-3.5 w-3.5" />
            {workspaceName ?? t('teachModules.workspace')}
          </p>
          <h1 className="font-black text-[clamp(2rem,4vw,3.5rem)] leading-none tracking-normal">
            {t('teachModules.title')}
          </h1>
          <p className="mt-3 max-w-2xl text-muted-foreground leading-7">
            {t('teachModules.description')}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Course grid ──────────────────────────────────────────────────────────────

function CourseGrid({
  courses,
  onArchive,
  onPublish,
  wsId,
}: {
  courses: Array<{
    archived?: boolean;
    id: string;
    is_course_published?: boolean;
    members_count?: number;
    name: string | null;
    description: string | null;
    totalModules: number;
    completedModules: number;
    progress: number;
  }>;
  onArchive: (courseId: string) => void;
  onPublish: (courseId: string, isPublished: boolean) => void;
  wsId: string;
}) {
  const t = useTranslations();

  if (!courses.length) {
    return <ModulesEmptyState label={t('teachModules.noCourses')} />;
  }

  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {courses.map((course, index) => (
        <CourseGroupCard
          course={course}
          index={index}
          key={course.id}
          onArchive={() => onArchive(course.id)}
          onPublish={(isPublished) => onPublish(course.id, isPublished)}
          wsId={wsId}
        />
      ))}
    </div>
  );
}

// ─── Summary bar ─────────────────────────────────────────────────────────────

function ModulesSummaryBar({
  courseCount,
  totalModules,
}: {
  courseCount: number;
  totalModules: number;
}) {
  const t = useTranslations();

  return (
    <div className="flex flex-wrap gap-3">
      <div className="border-2 border-border bg-card px-4 py-2 shadow-[3px_3px_0_var(--border)]">
        <span className="font-black text-2xl tabular-nums">{courseCount}</span>
        <span className="ml-2 text-muted-foreground text-sm">
          {t('teachModules.courses')}
        </span>
      </div>
      <div className="border-2 border-border bg-card px-4 py-2 shadow-[3px_3px_0_var(--border)]">
        <span className="font-black text-2xl tabular-nums">{totalModules}</span>
        <span className="ml-2 text-muted-foreground text-sm">
          {t('teachModules.totalModules')}
        </span>
      </div>
    </div>
  );
}

// ─── Main client component ────────────────────────────────────────────────────

export function ModulesPageClient({
  wsId,
  workspaceName,
}: {
  wsId: string;
  workspaceName: string | null;
}) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const queryKey = ['teach-courses', wsId] as const;

  const coursesQuery = useQuery({
    enabled: Boolean(wsId),
    queryFn: () =>
      listWorkspaceCourses(wsId, { pageSize: 100, status: 'active' }),
    queryKey,
  });

  const invalidateCourses = () => queryClient.invalidateQueries({ queryKey });

  const createCourse = useMutation({
    mutationFn: (payload: { description?: string; name: string }) =>
      createWorkspaceCourse(wsId, payload),
    onSuccess: invalidateCourses,
  });

  const publishCourse = useMutation({
    mutationFn: ({
      courseId,
      isPublished,
    }: {
      courseId: string;
      isPublished: boolean;
    }) => publishWorkspaceCourse(wsId, courseId, isPublished),
    onSuccess: invalidateCourses,
  });

  const archiveCourse = useMutation({
    mutationFn: (courseId: string) => archiveWorkspaceCourse(wsId, courseId),
    onSuccess: invalidateCourses,
  });

  const courses = (coursesQuery.data?.data ?? []).map(toCourseCardItem);
  const totalModules = courses.reduce(
    (sum: number, c) => sum + c.totalModules,
    0
  );

  return (
    <main className="min-h-screen bg-root-background px-5 py-5 text-foreground md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <ModulesPageHeader wsId={wsId} workspaceName={workspaceName} />

        <CourseCreatePanel
          isPending={createCourse.isPending}
          onCreate={(payload) => createCourse.mutate(payload)}
        />

        {/* Summary bar */}
        {!coursesQuery.isLoading && courses.length > 0 ? (
          <ModulesSummaryBar
            courseCount={courses.length}
            totalModules={totalModules}
          />
        ) : null}

        {/* Section label */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-black text-2xl">
              {t('teachModules.allCourses')}
            </h2>
            <p className="mt-1 text-muted-foreground text-sm">
              {t('teachModules.allCoursesDescription')}
            </p>
          </div>
        </div>

        {/* Content */}
        {coursesQuery.isLoading ? (
          <ModulesLoadingState />
        ) : coursesQuery.isError ? (
          <ModulesEmptyState
            label={t('teachModules.loadError')}
            action={
              <button
                className="border-2 border-border bg-background px-4 py-2 font-bold text-sm shadow-[3px_3px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--border)]"
                onClick={() => coursesQuery.refetch()}
                type="button"
              >
                {t('common.retry')}
              </button>
            }
          />
        ) : (
          <CourseGrid
            courses={courses}
            onArchive={(courseId) => archiveCourse.mutate(courseId)}
            onPublish={(courseId, isPublished) =>
              publishCourse.mutate({ courseId, isPublished })
            }
            wsId={wsId}
          />
        )}
      </div>
    </main>
  );
}

function toCourseCardItem(course: WorkspaceCourseListItem) {
  const totalModules = course.modules_count ?? 0;
  return {
    archived: course.archived,
    completedModules: 0,
    description: course.description,
    id: course.id,
    is_course_published: course.is_course_published,
    members_count: course.members_count,
    name: course.name,
    progress: course.is_course_published ? 100 : 0,
    totalModules,
  };
}
