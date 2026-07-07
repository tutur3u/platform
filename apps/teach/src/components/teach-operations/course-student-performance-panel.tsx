'use client';

import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Users,
  XCircle,
} from '@tuturuuu/icons';
import {
  getCourseStudentPerformance,
  type StudentPerformanceStat,
} from '@tuturuuu/internal-api';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function CourseStudentPerformancePanel({
  courseId,
  wsId,
}: {
  courseId: string;
  wsId: string;
}) {
  const t = useTranslations('teachStudentPerformance');
  const [expanded, setExpanded] = useState(true);
  const [sortKey, setSortKey] = useState<
    'risk' | 'score' | 'progress' | 'activity'
  >('risk');
  const [sortAsc, setSortAsc] = useState(false);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['course-student-performance', wsId, courseId],
    queryFn: () => getCourseStudentPerformance(wsId, courseId),
    staleTime: 1000 * 60 * 2, // 2 min cache
  });

  const students = [...(data?.students ?? [])].sort((a, b) => {
    const dir = sortAsc ? 1 : -1;
    if (sortKey === 'score') {
      return dir * ((a.scorePercent ?? -1) - (b.scorePercent ?? -1));
    }
    if (sortKey === 'progress') {
      return dir * (a.completedModules - b.completedModules);
    }
    if (sortKey === 'activity') {
      const da = a.lastActivityAt ?? '';
      const db = b.lastActivityAt ?? '';
      return dir * da.localeCompare(db);
    }
    // risk: no submission → low score → pending → score asc
    if (a.hasNotSubmitted !== b.hasNotSubmitted)
      return dir * (a.hasNotSubmitted ? -1 : 1);
    if (a.isLowScorer !== b.isLowScorer) return dir * (a.isLowScorer ? -1 : 1);
    if (a.pendingGradingCount !== b.pendingGradingCount)
      return dir * (b.pendingGradingCount - a.pendingGradingCount);
    return dir * ((a.scorePercent ?? 101) - (b.scorePercent ?? 101));
  });

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  const summary = data
    ? {
        atRisk: data.students.filter(
          (s) => s.hasNotSubmitted || s.isLowScorer
        ).length,
        avgScore:
          data.students.filter((s) => s.scorePercent !== null).length > 0
            ? Math.round(
                data.students
                  .filter((s) => s.scorePercent !== null)
                  .reduce((s, x) => s + (x.scorePercent ?? 0), 0) /
                  data.students.filter((s) => s.scorePercent !== null).length
              )
            : null,
        pending: data.students.reduce(
          (s, x) => s + x.pendingGradingCount,
          0
        ),
        notSubmitted: data.students.filter((s) => s.hasNotSubmitted).length,
      }
    : null;

  return (
    <section className="border-2 border-border bg-background shadow-[4px_4px_0_var(--border)]">
      {/* Header */}
      <button
        className="flex w-full items-center justify-between gap-4 p-5 text-left"
        onClick={() => setExpanded((v) => !v)}
        type="button"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-border bg-dynamic-cyan/15">
            <Users className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-black text-lg leading-none">
              {t('title') || 'Student Performance'}
            </h2>
            {summary && (
              <p className="mt-0.5 text-muted-foreground text-xs">
                {data?.students.length ?? 0} {t('students') || 'students'} ·{' '}
                {data?.totalModules ?? 0} {t('modules') || 'modules'} ·{' '}
                {data?.totalQuizzes ?? 0} {t('quizTitle') || 'quiz questions'} ·{' '}
                <span className="italic">{t('quizSubtitle') || 'module quiz practice only'}</span>
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isFetching && (
            <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
          {expanded ? (
            <ChevronUp className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-border border-t-2 p-5 pt-4 space-y-4">
          {/* Summary chips */}
          {summary && data && data.students.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <SummaryChip
                icon={TrendingUp}
                label={t('avgScore') || 'Avg. Score'}
                value={
                  summary.avgScore !== null ? `${summary.avgScore}%` : '—'
                }
                variant="neutral"
              />
              <SummaryChip
                icon={AlertTriangle}
                label={t('atRisk') || 'At Risk'}
                value={String(summary.atRisk)}
                variant={summary.atRisk > 0 ? 'danger' : 'neutral'}
              />
              <SummaryChip
                icon={BookOpenCheck}
                label={t('pendingGrading') || 'Pending Grading'}
                value={String(summary.pending)}
                variant={summary.pending > 0 ? 'warning' : 'neutral'}
              />
              <SummaryChip
                icon={XCircle}
                label={t('notSubmitted') || 'Not Submitted'}
                value={String(summary.notSubmitted)}
                variant={summary.notSubmitted > 0 ? 'info' : 'neutral'}
              />
            </div>
          )}

          {/* Table */}
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-16 animate-pulse border-2 border-border bg-muted"
                />
              ))}
            </div>
          ) : isError ? (
            <div className="border-2 border-destructive/30 bg-destructive/5 p-4 text-center">
              <p className="font-bold text-destructive text-sm">
                {t('loadError') || 'Failed to load student data'}
              </p>
              <button
                className="mt-2 border-2 border-border px-3 py-1 font-bold text-xs shadow-[2px_2px_0_var(--border)] hover:bg-muted"
                onClick={() => void refetch()}
                type="button"
              >
                {t('retry') || 'Retry'}
              </button>
            </div>
          ) : students.length === 0 ? (
            <div className="border-2 border-border border-dashed p-8 text-center">
              <p className="font-black text-lg">
                {t('noStudents') || 'No students enrolled'}
              </p>
              <p className="mt-2 text-muted-foreground text-sm">
                {t('noStudentsHint') ||
                  'Add learners to this course group to see their performance.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-border border-b-2 text-left">
                    <th className="pb-2 pr-3 font-black text-xs uppercase tracking-wider">
                      {t('student') || 'Student'}
                    </th>
                    <SortableHeader
                      active={sortKey === 'score'}
                      asc={sortAsc}
                      label={t('score') || 'Score'}
                      onClick={() => toggleSort('score')}
                    />
                    <SortableHeader
                      active={sortKey === 'progress'}
                      asc={sortAsc}
                      label={t('progress') || 'Progress'}
                      onClick={() => toggleSort('progress')}
                    />
                    <th className="pb-2 pr-3 font-black text-xs uppercase tracking-wider">
                      {t('quizTitle') || 'Quiz Practice'}
                    </th>
                    <SortableHeader
                      active={sortKey === 'activity'}
                      asc={sortAsc}
                      label={t('lastActive') || 'Last Active'}
                      onClick={() => toggleSort('activity')}
                    />
                    <th className="pb-2 font-black text-xs uppercase tracking-wider">
                      {t('status') || 'Status'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {students.map((s) => (
                    <StudentRow
                      key={s.userId}
                      student={s}
                      t={t}
                      totalModules={data?.totalModules ?? 0}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function SortableHeader({
  active,
  asc,
  label,
  onClick,
}: {
  active: boolean;
  asc: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <th className="pb-2 pr-3">
      <button
        className={cn(
          'flex items-center gap-1 font-black text-xs uppercase tracking-wider hover:text-foreground',
          active ? 'text-foreground' : 'text-muted-foreground'
        )}
        onClick={onClick}
        type="button"
      >
        {label}
        {active ? (
          asc ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )
        ) : null}
      </button>
    </th>
  );
}

function StudentRow({
  student: s,
  t,
  totalModules,
}: {
  student: StudentPerformanceStat;
  t: ReturnType<typeof useTranslations<'teachStudentPerformance'>>;
  totalModules: number;
}) {
  const name = s.displayName ?? s.email ?? s.userId.slice(0, 8);
  const progressPct =
    totalModules > 0
      ? Math.round((s.completedModules / totalModules) * 100)
      : 0;

  const rowRisk = s.hasNotSubmitted
    ? 'danger'
    : s.isLowScorer
      ? 'warning'
      : 'ok';

  return (
    <tr
      className={cn(
        'transition-colors hover:bg-muted/30',
        rowRisk === 'danger' && 'bg-dynamic-red/5',
        rowRisk === 'warning' && 'bg-dynamic-yellow/5'
      )}
    >
      {/* Student name */}
      <td className="py-3 pr-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center border-2 border-border font-black text-[10px]',
              rowRisk === 'danger' && 'bg-dynamic-red/20 border-dynamic-red/50',
              rowRisk === 'warning' &&
                'bg-dynamic-yellow/20 border-dynamic-yellow/50',
              rowRisk === 'ok' && 'bg-muted'
            )}
          >
            {name.slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate font-bold text-sm leading-none">{name}</p>
            {s.email && s.displayName && (
              <p className="truncate text-muted-foreground text-xs">
                {s.email}
              </p>
            )}
          </div>
        </div>
      </td>

      {/* Score */}
      <td className="py-3 pr-3">
        {s.hasNotSubmitted ? (
          <span className="text-muted-foreground text-xs">—</span>
        ) : s.scorePercent === null ? (
          <span className="inline-flex items-center gap-1 text-dynamic-yellow text-xs font-bold">
            <Clock className="h-3 w-3" />
            {t('pending') || 'Pending'}
          </span>
        ) : (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-16 overflow-hidden rounded-none border border-border bg-muted">
              <div
                className={cn(
                  'h-full',
                  s.scorePercent >= 75
                    ? 'bg-dynamic-green'
                    : s.scorePercent >= 50
                      ? 'bg-dynamic-yellow'
                      : 'bg-dynamic-red'
                )}
                style={{ width: `${s.scorePercent}%` }}
              />
            </div>
            <span
              className={cn(
                'font-black text-sm tabular-nums',
                s.scorePercent >= 75
                  ? 'text-dynamic-green'
                  : s.scorePercent >= 50
                    ? 'text-dynamic-yellow'
                    : 'text-dynamic-red'
              )}
            >
              {s.scorePercent}%
            </span>
          </div>
        )}
      </td>

      {/* Module progress */}
      <td className="py-3 pr-3">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-16 overflow-hidden rounded-none border border-border bg-muted">
            <div
              className="h-full bg-dynamic-cyan"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="font-bold text-muted-foreground text-xs tabular-nums">
            {s.completedModules}/{totalModules}
          </span>
        </div>
      </td>

      {/* Quiz answered/total */}
      <td className="py-3 pr-3">
        <div className="text-xs">
          <span className="font-black tabular-nums">{s.answeredCount}</span>
          <span className="text-muted-foreground">/{s.totalQuizzes}</span>
          {s.pendingGradingCount > 0 && (
            <span className="ml-1 font-bold text-dynamic-yellow">
              (+{s.pendingGradingCount} {t('pending') || 'pending'})
            </span>
          )}
        </div>
      </td>

      {/* Last active */}
      <td className="py-3 pr-3">
        {s.lastActivityAt ? (
          <span className="text-muted-foreground text-xs" title={s.lastActivityAt}>
            {formatRelativeTime(s.lastActivityAt)}
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </td>

      {/* Risk status badges */}
      <td className="py-3">
        <div className="flex flex-wrap gap-1">
          {s.hasNotSubmitted && (
            <Badge icon={XCircle} label={t('neverSubmitted') || 'Never submitted'} variant="danger" />
          )}
          {s.isLowScorer && (
            <Badge icon={TrendingDown} label={t('lowScore') || 'Low score'} variant="warning" />
          )}
          {s.pendingGradingCount > 0 && !s.hasNotSubmitted && !s.isLowScorer && (
            <Badge icon={Clock} label={t('awaitingGrade') || 'Awaiting grade'} variant="info" />
          )}
          {!s.hasNotSubmitted && !s.isLowScorer && s.pendingGradingCount === 0 && (
            <Badge icon={CheckCircle2} label={t('onTrack') || 'On track'} variant="ok" />
          )}
        </div>
      </td>
    </tr>
  );
}

function Badge({
  icon: Icon,
  label,
  variant,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  variant: 'danger' | 'warning' | 'info' | 'ok';
}) {
  const styles = {
    danger: 'border-dynamic-red/50 bg-dynamic-red/10 text-dynamic-red',
    warning: 'border-dynamic-yellow/50 bg-dynamic-yellow/10 text-dynamic-yellow',
    info: 'border-dynamic-cyan/50 bg-dynamic-cyan/10 text-dynamic-cyan',
    ok: 'border-dynamic-green/50 bg-dynamic-green/10 text-dynamic-green',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 border px-1.5 py-0.5 font-bold text-[10px] leading-none',
        styles[variant]
      )}
    >
      <Icon className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}

function SummaryChip({
  icon: Icon,
  label,
  value,
  variant,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  variant: 'neutral' | 'danger' | 'warning' | 'info';
}) {
  const styles = {
    neutral: 'border-border bg-muted/40',
    danger: 'border-dynamic-red/40 bg-dynamic-red/10',
    warning: 'border-dynamic-yellow/40 bg-dynamic-yellow/10',
    info: 'border-dynamic-cyan/40 bg-dynamic-cyan/10',
  };
  return (
    <div
      className={cn(
        'flex items-center gap-3 border-2 p-3',
        styles[variant]
      )}
    >
      <Icon
        className={cn(
          'h-5 w-5 shrink-0',
          variant === 'neutral' && 'text-muted-foreground',
          variant === 'danger' && 'text-dynamic-red',
          variant === 'warning' && 'text-dynamic-yellow',
          variant === 'info' && 'text-dynamic-cyan'
        )}
      />
      <div>
        <p className="font-black text-xl tabular-nums leading-none">{value}</p>
        <p className="mt-0.5 text-muted-foreground text-xs">{label}</p>
      </div>
    </div>
  );
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
