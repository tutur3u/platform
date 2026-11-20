'use client';

import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  BookOpenCheck,
  CalendarCheck,
  FileText,
  Gauge,
} from '@tuturuuu/icons';
import { listWorkspaceCourses } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { Skeleton } from '@tuturuuu/ui/skeleton';
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
  const dashboard = useTranslations('teacherWorkspace');
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
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <header className="space-y-3">
        <Button asChild size="sm" variant="ghost">
          <Link href={`/${wsId}`}>
            <ArrowLeft aria-hidden />
            {t('backToDashboard')}
          </Link>
        </Button>
        <h1 className="flex items-center gap-3 font-semibold text-3xl tracking-tight">
          <Icon aria-hidden className="size-6 shrink-0 text-muted-foreground" />
          {t(`${mode}.title`)}
        </h1>
      </header>

      {coursesQuery.isLoading ? (
        <div aria-label={t('loading')} role="status" className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : coursesQuery.isError && !coursesQuery.data ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <p role="alert" className="text-muted-foreground text-sm">
              {dashboard('loadError')}
            </p>
            <Button
              disabled={coursesQuery.isFetching}
              onClick={() => void coursesQuery.refetch()}
              variant="outline"
            >
              {dashboard('retry')}
            </Button>
          </CardContent>
        </Card>
      ) : activeCourse ? (
        <>
          <CoursePicker
            activeCourseId={activeCourseId}
            courses={courses}
            onChange={setSelectedCourseId}
          />
          {mode === 'attendance' ? (
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
              courseName={activeCourse.name}
              key={activeCourseId}
              wsId={wsId}
            />
          ) : (
            <MetricsPanel courseId={activeCourseId} wsId={wsId} />
          )}
        </>
      ) : (
        <Card>
          <CardContent className="space-y-3">
            <p className="font-medium">{t('emptyCoursesTitle')}</p>
            <p className="text-muted-foreground text-sm">
              {t('emptyCoursesBody')}
            </p>
            <Button asChild>
              <Link href={`/${wsId}/courses`}>{t('createCourse')}</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
