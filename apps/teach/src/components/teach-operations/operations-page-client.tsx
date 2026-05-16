'use client';

import { useQuery } from '@tanstack/react-query';
import { BookOpenCheck, CalendarCheck, FileText, Gauge } from '@tuturuuu/icons';
import { listWorkspaceCourses } from '@tuturuuu/internal-api';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { AttendancePanel } from './attendance-panel';
import { CoursePicker } from './course-picker';
import { MetricsPanel } from './metrics-panel';
import { PostsPanel } from './posts-panel';
import { ReportsPanel } from './reports-panel';

export type TeachOperationMode =
  | 'assignments'
  | 'attendance'
  | 'metrics'
  | 'reports';

const modeIcons = {
  assignments: FileText,
  attendance: CalendarCheck,
  metrics: Gauge,
  reports: BookOpenCheck,
} satisfies Record<TeachOperationMode, typeof FileText>;

export function OperationsPageClient({
  initialCourseId,
  mode,
  wsId,
}: {
  initialCourseId?: string;
  mode: TeachOperationMode;
  wsId: string;
}) {
  const t = useTranslations('teachOperations');
  const [selectedCourseId, setSelectedCourseId] = useState(
    initialCourseId ?? ''
  );
  const coursesQuery = useQuery({
    queryFn: () =>
      listWorkspaceCourses(wsId, { pageSize: 100, status: 'active' }),
    queryKey: ['teach-courses', wsId],
  });
  const courses = coursesQuery.data?.data ?? [];
  const activeCourseId =
    selectedCourseId && courses.some((course) => course.id === selectedCourseId)
      ? selectedCourseId
      : (courses[0]?.id ?? '');
  const activeCourse =
    courses.find((course) => course.id === activeCourseId) ?? courses[0];
  const Icon = modeIcons[mode];

  return (
    <main className="min-h-screen bg-root-background px-5 py-5 text-foreground md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="border-2 border-border bg-background p-6 shadow-[8px_8px_0_var(--border)] md:p-8">
          <Link
            className="mb-5 inline-flex items-center border-2 border-border bg-card px-3 py-1.5 font-bold text-sm shadow-[2px_2px_0_var(--border)]"
            href={`/${wsId}`}
          >
            {t('backToDashboard')}
          </Link>
          <div className="flex items-start gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center border-2 border-border bg-dynamic-cyan/15 shadow-[4px_4px_0_var(--border)]">
              <Icon className="h-7 w-7" />
            </span>
            <div>
              <h1 className="font-black text-[clamp(2rem,4vw,3.5rem)] leading-none">
                {t(`${mode}.title`)}
              </h1>
              <p className="mt-3 max-w-2xl text-muted-foreground leading-7">
                {t(`${mode}.lead`)}
              </p>
            </div>
          </div>
        </header>

        {coursesQuery.isLoading ? (
          <div className="border-2 border-border bg-card p-6 font-black shadow-[4px_4px_0_var(--border)]">
            {t('loading')}
          </div>
        ) : courses.length ? (
          <>
            <CoursePicker
              activeCourseId={activeCourseId}
              courses={courses}
              onChange={setSelectedCourseId}
            />
            {mode === 'attendance' && activeCourse ? (
              <AttendancePanel
                course={activeCourse}
                key={activeCourse.id}
                wsId={wsId}
              />
            ) : mode === 'assignments' ? (
              <PostsPanel courseId={activeCourseId} wsId={wsId} />
            ) : mode === 'reports' ? (
              <ReportsPanel
                courseId={activeCourseId}
                courseName={activeCourse?.name ?? t('course')}
                key={activeCourseId}
                wsId={wsId}
              />
            ) : (
              <MetricsPanel courseId={activeCourseId} wsId={wsId} />
            )}
          </>
        ) : (
          <div className="border-2 border-border border-dashed bg-muted/50 p-8 shadow-[4px_4px_0_var(--border)]">
            <p className="font-black text-2xl">{t('emptyCoursesTitle')}</p>
            <p className="mt-2 text-muted-foreground">
              {t('emptyCoursesBody')}
            </p>
            <Link
              className="mt-5 inline-flex h-11 items-center border-2 border-border bg-primary px-4 font-black text-primary-foreground shadow-[3px_3px_0_var(--border)]"
              href={`/${wsId}/courses`}
            >
              {t('createCourse')}
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
