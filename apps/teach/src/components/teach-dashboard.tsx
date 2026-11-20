import {
  ArrowRight,
  BookOpenCheck,
  CalendarDays,
  ClipboardCheck,
  FileText,
  ListChecks,
} from '@tuturuuu/icons';
import type {
  TeachDashboardStatsResponse,
  TulearnWorkspaceSummary,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Badge } from '@tuturuuu/ui/badge';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

type Course = { id: string; name: string; modules_count: number };
type CourseList = { count: number; data: Course[] };

export async function TeachDashboard({
  courses,
  dashboardStats,
  workspace,
  wsId,
}: {
  courses: CourseList | null;
  dashboardStats: TeachDashboardStatsResponse | null;
  workspace: TulearnWorkspaceSummary;
  wsId: string;
}) {
  const t = await getTranslations('teacherWorkspace');
  const base = `/${wsId}`;
  const actions = [
    { label: t('timetable'), href: `${base}/attendance`, Icon: CalendarDays },
    {
      label: t('quizzes'),
      href: `${base}/education/library/quizzes`,
      Icon: ListChecks,
    },
    {
      label: t('gradebook'),
      href: `${base}/education/attempts`,
      Icon: ClipboardCheck,
    },
    { label: t('reports'), href: `${base}/reports`, Icon: FileText },
  ];
  const stats = [
    { label: t('courseCount'), value: courses?.count },
    {
      label: t('pendingGrading'),
      value: dashboardStats?.total_pending_grading,
    },
    { label: t('notSubmitted'), value: dashboardStats?.total_not_submitted },
    { label: t('needsSupport'), value: dashboardStats?.total_low_scorers },
  ];

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          {workspace.name && (
            <p className="text-muted-foreground text-sm">{workspace.name}</p>
          )}
          <h1 className="font-semibold text-3xl tracking-tight">
            {t('title')}
          </h1>
        </div>
        <Button asChild>
          <Link href={`${base}/courses`}>
            <BookOpenCheck aria-hidden />
            {t('manageCourses')}
          </Link>
        </Button>
      </header>

      <nav aria-label={t('quickLinks')} className="flex flex-wrap gap-2">
        {actions.map(({ label, href, Icon }) => (
          <Button asChild key={href} variant="outline">
            <Link href={href}>
              <Icon aria-hidden />
              {label}
            </Link>
          </Button>
        ))}
      </nav>

      <dl className="grid grid-cols-2 overflow-hidden rounded-lg border bg-card lg:grid-cols-4">
        {stats.map(({ label, value }) => (
          <div
            className="space-y-1 border-border p-4 lg:border-e lg:last:border-e-0"
            key={label}
          >
            <dt className="text-muted-foreground text-sm">{label}</dt>
            <dd className="font-semibold text-2xl tabular-nums">
              {value ?? (
                <span className="text-muted-foreground text-sm">
                  {t('unavailable')}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>

      <Card>
        <CardHeader>
          <CardTitle>{t('activeCourses')}</CardTitle>
        </CardHeader>
        <CardContent>
          {!courses ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p role="alert" className="text-muted-foreground text-sm">
                {t('loadError')}
              </p>
              <Button asChild variant="outline">
                <a href={base}>{t('retry')}</a>
              </Button>
            </div>
          ) : courses.data.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('empty')}</p>
          ) : (
            <ul className="divide-y divide-border">
              {courses.data.map((course) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  key={course.id}
                >
                  <div className="min-w-0 space-y-1">
                    <Link
                      href={`${base}/courses/${course.id}`}
                      className="break-words font-medium hover:underline"
                    >
                      {course.name}
                    </Link>
                    <div>
                      <Badge variant="secondary">
                        {t('moduleCount', { count: course.modules_count })}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`${base}/attendance?course=${course.id}`}>
                        {t('attendance')}
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="ghost">
                      <Link
                        href={`${base}/education/courses/${course.id}/builder`}
                      >
                        {t('builder')}
                        <ArrowRight aria-hidden />
                      </Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
