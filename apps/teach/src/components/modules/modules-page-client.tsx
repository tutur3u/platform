'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BookOpenCheck, GraduationCap } from '@tuturuuu/icons';
import { listSharedCourses } from '@tuturuuu/internal-api';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
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
  wsId,
}: {
  courses: Array<{
    id: string;
    name: string | null;
    description: string | null;
    totalModules: number;
    completedModules: number;
    progress: number;
  }>;
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

  const coursesQuery = useQuery({
    enabled: Boolean(wsId),
    queryFn: () => listSharedCourses(wsId),
    queryKey: ['teach-courses', wsId],
  });

  const courses = coursesQuery.data?.courses ?? [];
  const totalModules = courses.reduce(
    (sum: number, c) => sum + c.totalModules,
    0
  );

  return (
    <main className="min-h-screen bg-root-background px-5 py-5 text-foreground md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <ModulesPageHeader wsId={wsId} workspaceName={workspaceName} />

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
          <CourseGrid courses={courses} wsId={wsId} />
        )}
      </div>
    </main>
  );
}
