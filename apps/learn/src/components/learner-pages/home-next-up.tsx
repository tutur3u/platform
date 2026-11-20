'use client';

import {
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  FileQuestion,
} from '@tuturuuu/icons';
import type {
  TulearnAssignmentSummary,
  TulearnCourseSummary,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { withLearnerStudent } from './learner-navigation';

export function selectCourseToResume(courses: TulearnCourseSummary[]) {
  return (
    courses.find(({ progress }) => progress > 0 && progress < 100) ??
    courses.find(({ progress }) => progress < 100)
  );
}

export function HomeNextUp({
  assignments,
  course,
  studentId,
  wsId,
}: {
  assignments: TulearnAssignmentSummary[];
  course?: TulearnCourseSummary;
  studentId: string | null;
  wsId: string;
}) {
  const t = useTranslations();
  const format = useFormatter();
  const href = (path: string) =>
    withLearnerStudent(`/${wsId}${path}`, studentId);
  const assignmentsHref = href('/assignments');
  const openAssignments = assignments.filter(
    ({ is_completed }) => !is_completed
  );
  const progress = Math.max(0, Math.min(course?.progress ?? 0, 100));

  return (
    <section aria-labelledby="learn-next-up" className="space-y-3">
      <h2 className="font-semibold text-xl tracking-tight" id="learn-next-up">
        {t('learnerWorkspace.nextUp')}
      </h2>
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Card className="justify-between gap-4 bg-accent/40">
          <CardHeader>
            <div className="flex gap-4">
              <div className="min-w-0 flex-1 space-y-2">
                <BookOpen
                  aria-hidden
                  className="size-5 text-muted-foreground"
                />
                <CardTitle className="wrap-break-word text-balance text-2xl leading-tight">
                  {course?.name ?? t('courses.title')}
                </CardTitle>
                {course?.description && (
                  <p className="line-clamp-2 text-muted-foreground text-sm">
                    {course.description}
                  </p>
                )}
              </div>
              {course && (
                <div
                  aria-label={t('home.learningPath')}
                  aria-valuemax={100}
                  aria-valuemin={0}
                  aria-valuenow={progress}
                  className="grid size-20 shrink-0 place-items-center rounded-full"
                  role="progressbar"
                  style={{
                    background: `conic-gradient(var(--primary) ${progress}%, var(--muted) 0)`,
                  }}
                >
                  <span className="grid size-17 place-items-center rounded-full bg-card font-semibold text-sm tabular-nums">
                    {format.number(progress / 100, { style: 'percent' })}
                  </span>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <Button asChild>
              <Link href={href(course ? `/courses/${course.id}` : '/courses')}>
                {course ? t('home.continueCourse') : t('courses.title')}
                <ArrowRight aria-hidden />
              </Link>
            </Button>
            {course && (
              <p className="text-muted-foreground text-sm tabular-nums">
                {t('learnerWorkspace.moduleCompletion', {
                  completed: course.completedModules,
                  total: course.totalModules,
                })}
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="gap-3">
          <CardHeader>
            <CardTitle>{t('assignments.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {openAssignments.length ? (
              <ul className="divide-y divide-border">
                {openAssignments.slice(0, 3).map((assignment) => {
                  const Icon = assignment.is_test
                    ? FileQuestion
                    : ClipboardCheck;
                  const title = assignment.title ?? t('assignments.untitled');
                  const itemHref = assignment.is_test
                    ? href(
                        `/courses/${assignment.course.id}/tests/${assignment.id}`
                      )
                    : assignmentsHref;
                  return (
                    <li key={assignment.id}>
                      <Link
                        className="group flex items-center gap-3 rounded-md py-2.5 focus-visible:outline-2 focus-visible:outline-ring"
                        href={itemHref}
                      >
                        <Icon
                          aria-hidden
                          className="size-4 shrink-0 text-muted-foreground"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block wrap-break-word font-medium text-sm group-hover:underline">
                            {title}
                          </span>
                          {assignment.course.name && (
                            <span className="block wrap-break-word text-muted-foreground text-xs">
                              {assignment.course.name}
                            </span>
                          )}
                        </span>
                        <ArrowRight
                          aria-hidden
                          className="size-4 shrink-0 text-muted-foreground"
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">
                {t('learnerWorkspace.noOpenAssignments')}
              </p>
            )}
            <Button asChild size="sm" variant="outline">
              <Link href={assignmentsHref}>
                {t('learnerWorkspace.allAssignments')}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
