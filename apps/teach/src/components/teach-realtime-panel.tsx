'use server';

import {
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  ClipboardList,
  TrendingDown,
  Users,
} from '@tuturuuu/icons';
import type {
  TeachDashboardCourseStat,
  TeachDashboardStatsResponse,
} from '@tuturuuu/internal-api';
import { cn } from '@tuturuuu/utils/format';
import { getTranslations } from 'next-intl/server';

export async function TeachRealtimePanel({
  stats,
  wsId,
}: {
  stats: TeachDashboardStatsResponse | null;
  wsId: string;
}) {
  const t = await getTranslations('teachDashboard');

  const hasAlerts =
    stats &&
    (stats.total_pending_grading > 0 ||
      stats.total_not_submitted > 0 ||
      stats.total_low_scorers > 0);

  return (
    <section className="mx-auto mt-8 max-w-7xl space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 inline-flex items-center gap-2 border-2 border-border bg-dynamic-orange/15 px-3 py-1 font-black text-xs shadow-[3px_3px_0_var(--border)]">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-dynamic-orange opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-dynamic-orange" />
            </span>
            {t('realtimeEyebrow') || 'Real-time Overview'}
          </p>
          <h2 className="font-black text-3xl">
            {t('realtimeTitle') || 'Course Status Dashboard'}
          </h2>
          <p className="mt-2 max-w-2xl text-muted-foreground text-sm leading-6">
            {t('realtimeLead') ||
              'Top 5 active courses — students, pending grading, unsubmitted work, and low scorers.'}
          </p>
        </div>
        <a
          className="inline-flex h-10 shrink-0 items-center gap-2 border-2 border-border bg-background px-3 font-black text-xs shadow-[2px_2px_0_var(--border)]"
          href={`/${wsId}/courses`}
        >
          {t('allGroups') || 'All courses'}
          <ArrowRight className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* Alert summary bar */}
      {hasAlerts && (
        <div className="grid gap-3 sm:grid-cols-3">
          <AlertBadge
            count={stats.total_pending_grading}
            icon={ClipboardList}
            label={t('pendingGrading') || 'Pending Grading'}
            variant="warning"
          />
          <AlertBadge
            count={stats.total_not_submitted}
            icon={BookOpenCheck}
            label={t('notSubmitted') || 'Not Submitted'}
            variant="info"
          />
          <AlertBadge
            count={stats.total_low_scorers}
            icon={TrendingDown}
            label={t('lowScorers') || 'Low Scorers (<50%)'}
            variant="danger"
          />
        </div>
      )}

      {/* Course table / cards */}
      {!stats || stats.courses.length === 0 ? (
        <div className="border-2 border-border border-dashed bg-muted/40 p-10 text-center shadow-[4px_4px_0_var(--border)]">
          <p className="font-black text-xl">
            {t('emptyGroupsTitle') || 'No active courses'}
          </p>
          <p className="mt-3 text-muted-foreground text-sm">
            {t('emptyGroupsBody') ||
              'Create a course group to see real-time stats here.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {stats.courses.map((course, i) => (
            <CourseStatRow
              course={course}
              index={i}
              key={course.id}
              t={t}
              wsId={wsId}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function AlertBadge({
  count,
  icon: Icon,
  label,
  variant,
}: {
  count: number;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  variant: 'warning' | 'info' | 'danger';
}) {
  const styles = {
    warning:
      'border-dynamic-yellow bg-dynamic-yellow/10 text-dynamic-yellow shadow-[3px_3px_0_hsl(var(--dynamic-yellow)/0.4)]',
    info: 'border-dynamic-cyan bg-dynamic-cyan/10 text-dynamic-cyan shadow-[3px_3px_0_hsl(var(--dynamic-cyan)/0.4)]',
    danger:
      'border-dynamic-red bg-dynamic-red/10 text-dynamic-red shadow-[3px_3px_0_hsl(var(--dynamic-red)/0.4)]',
  };
  return (
    <div
      className={cn('flex items-center gap-4 border-2 p-4', styles[variant])}
    >
      <Icon className="h-6 w-6 shrink-0 opacity-80" />
      <div>
        <p className="font-black text-2xl tabular-nums">{count}</p>
        <p className="font-bold text-xs opacity-80">{label}</p>
      </div>
    </div>
  );
}

function CourseStatRow({
  course,
  index,
  t,
  wsId,
}: {
  course: TeachDashboardCourseStat;
  index: number;
  t: Awaited<ReturnType<typeof getTranslations>>;
  wsId: string;
}) {
  const allClear =
    course.pending_grading === 0 &&
    course.not_submitted === 0 &&
    course.low_scorers === 0;

  return (
    <article className="grid gap-4 border-2 border-border bg-background p-4 shadow-[4px_4px_0_var(--border)] sm:grid-cols-[minmax(0,1fr)_auto]">
      {/* Left: course name + stats */}
      <div className="min-w-0 space-y-3">
        <div className="flex items-start gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center border-2 border-border font-black text-xs shadow-[1px_1px_0_var(--border)]">
            {index + 1}
          </span>
          <div className="min-w-0">
            <a
              className="block truncate font-black text-lg leading-tight hover:underline"
              href={`/${wsId}/courses/${course.id}`}
            >
              {course.name}
            </a>
            {allClear && (
              <span className="mt-0.5 inline-flex items-center gap-1 font-bold text-dynamic-green text-xs">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {t('allClear') || 'All clear'}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
          <StatChip
            icon={Users}
            label={t('members') || 'Students'}
            value={course.members_count}
            variant="neutral"
          />
          <StatChip
            label={t('modules') || 'Modules'}
            value={course.modules_count}
            variant="neutral"
          />
          <StatChip
            icon={ClipboardList}
            label={t('pendingGrading') || 'Pending'}
            value={course.pending_grading}
            variant={course.pending_grading > 0 ? 'warning' : 'neutral'}
          />
          <StatChip
            icon={BookOpenCheck}
            label={t('notSubmitted') || 'Not Submitted'}
            value={course.not_submitted}
            variant={course.not_submitted > 0 ? 'info' : 'neutral'}
          />
          <StatChip
            icon={TrendingDown}
            label={t('lowScorers') || 'Low Scorers'}
            value={course.low_scorers}
            variant={course.low_scorers > 0 ? 'danger' : 'neutral'}
          />
        </div>
      </div>

      {/* Right: quick action links */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-end sm:justify-center">
        {course.pending_grading > 0 && (
          <QuickActionLink
            href={`/${wsId}/courses/${course.id}`}
            label={t('gradeNow') || 'Grade Now'}
            variant="warning"
          />
        )}
        {course.low_scorers > 0 && (
          <QuickActionLink
            href={`/${wsId}/metrics?course=${course.id}`}
            label={t('viewMetrics') || 'View Metrics'}
            variant="danger"
          />
        )}
        <QuickActionLink
          href={`/${wsId}/courses/${course.id}`}
          label={t('openCourse') || 'Open'}
          variant="default"
        />
      </div>
    </article>
  );
}

function StatChip({
  icon: Icon,
  label,
  value,
  variant,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  variant: 'neutral' | 'warning' | 'info' | 'danger';
}) {
  const styles = {
    neutral: 'border-border bg-muted/50 text-foreground',
    warning:
      'border-dynamic-yellow/50 bg-dynamic-yellow/10 text-dynamic-yellow',
    info: 'border-dynamic-cyan/50 bg-dynamic-cyan/10 text-dynamic-cyan',
    danger: 'border-dynamic-red/50 bg-dynamic-red/10 text-dynamic-red',
  };
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 border-2 px-2 py-1.5',
        styles[variant]
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />}
      <div>
        <p className="font-black text-base tabular-nums leading-none">
          {value}
        </p>
        <p className="mt-0.5 truncate font-bold text-[10px] opacity-70">
          {label}
        </p>
      </div>
    </div>
  );
}

function QuickActionLink({
  href,
  label,
  variant,
}: {
  href: string;
  label: string;
  variant: 'warning' | 'danger' | 'default';
}) {
  const styles = {
    warning:
      'border-dynamic-yellow bg-dynamic-yellow/10 text-dynamic-yellow hover:bg-dynamic-yellow/20',
    danger:
      'border-dynamic-red bg-dynamic-red/10 text-dynamic-red hover:bg-dynamic-red/20',
    default: 'border-border bg-background hover:bg-muted/30',
  };
  return (
    <a
      className={cn(
        'inline-flex items-center gap-1.5 border-2 px-3 py-1.5 font-black text-xs shadow-[2px_2px_0_var(--border)] transition hover:-translate-y-0.5',
        styles[variant]
      )}
      href={href}
    >
      {label}
      <ArrowRight className="h-3 w-3" />
    </a>
  );
}
