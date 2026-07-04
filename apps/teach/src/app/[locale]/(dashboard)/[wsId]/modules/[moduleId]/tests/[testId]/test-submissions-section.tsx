'use client';

import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle,
  Clock,
  Eye,
  EyeOff,
  User,
  XCircle,
} from '@tuturuuu/icons';
import type { TeachTestSubmission } from '@tuturuuu/internal-api';
import { listWorkspaceCourseTestSubmissions } from '@tuturuuu/internal-api';
import { cn } from '@tuturuuu/utils/format';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { TestSubmissionDetailDialog } from './test-submission-detail-dialog';

interface TestSubmissionsSectionProps {
  wsId: string;
  courseId: string;
  testId: string;
  isScorePublished: boolean;
  onToggleScorePublished: () => void;
  isToggling: boolean;
}

export function TestSubmissionsSection({
  wsId,
  courseId,
  testId,
  isScorePublished,
  onToggleScorePublished,
  isToggling,
}: TestSubmissionsSectionProps) {
  const t = useTranslations();
  const locale = useLocale();

  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(
    null
  );
  const [selectedStudentName, setSelectedStudentName] = useState<string>('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['course-test-submissions', wsId, courseId, testId],
    queryFn: () => listWorkspaceCourseTestSubmissions(wsId, courseId, testId),
  });

  const submissions = data?.data ?? [];

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="h-20 animate-pulse border-2 border-border bg-card shadow-[4px_4px_0_var(--border)]"
          />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="border-2 border-border border-dashed bg-background p-8 text-center shadow-[4px_4px_0_var(--border)]">
        <p className="font-bold text-muted-foreground text-sm">
          {t('teachModules.submissionsLoadError')}
        </p>
      </div>
    );
  }

  if (submissions.length === 0) {
    return (
      <div className="border-2 border-border border-dashed bg-background p-8 text-center shadow-[4px_4px_0_var(--border)]">
        <User className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
        <p className="font-bold text-muted-foreground text-sm">
          {t('teachModules.noSubmissions')}
        </p>
        <p className="mt-1 text-muted-foreground text-xs">
          {t('teachModules.noSubmissionsDescription')}
        </p>
      </div>
    );
  }

  const submitted = submissions.filter((s) => s.submittedAt);
  const inProgress = submissions.filter((s) => !s.submittedAt);

  return (
    <div className="space-y-4">
      {/* Publish scores action */}
      <div className="flex items-center justify-between border-2 border-border bg-background p-4 shadow-[4px_4px_0_var(--border)]">
        <div>
          <p className="font-bold text-sm">
            {t('teachModules.scoreVisibility')}
          </p>
          <p className="text-muted-foreground text-xs">
            {isScorePublished
              ? t('teachModules.scoresVisibleToStudents')
              : t('teachModules.scoresHiddenFromStudents')}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleScorePublished}
          disabled={isToggling}
          className={cn(
            'inline-flex cursor-pointer items-center gap-2 border-2 border-border px-4 py-2.5 font-bold text-sm shadow-[3px_3px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--border)] active:translate-y-0 active:shadow-[1px_1px_0_var(--border)] disabled:opacity-50',
            isScorePublished
              ? 'bg-dynamic-green/15 text-foreground'
              : 'bg-primary text-primary-foreground'
          )}
        >
          {isScorePublished ? (
            <>
              <EyeOff className="h-4 w-4" />
              {t('teachModules.hideScores')}
            </>
          ) : (
            <>
              <Eye className="h-4 w-4" />
              {t('teachModules.publishScores')}
            </>
          )}
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label={t('teachModules.totalAttempts')}
          value={submissions.length}
        />
        <StatCard
          label={t('teachModules.submittedCount')}
          value={submitted.length}
          variant="success"
        />
        <StatCard
          label={t('teachModules.inProgressCount')}
          value={inProgress.length}
          variant="warning"
        />
        <StatCard
          label={t('teachModules.averageScore')}
          value={
            submitted.length > 0
              ? (
                  submitted.reduce((sum, s) => sum + (s.score ?? 0), 0) /
                  submitted.length
                ).toFixed(1)
              : '—'
          }
        />
      </div>

      {/* Submission list */}
      <div className="space-y-2">
        {submissions.map((submission) => (
          <SubmissionRow
            key={submission.id}
            locale={locale}
            submission={submission}
            t={t}
            onClick={() => {
              setSelectedAttemptId(submission.id);
              setSelectedStudentName(submission.userName);
            }}
          />
        ))}
      </div>

      <TestSubmissionDetailDialog
        wsId={wsId}
        courseId={courseId}
        testId={testId}
        attemptId={selectedAttemptId}
        studentName={selectedStudentName}
        open={!!selectedAttemptId}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedAttemptId(null);
            setSelectedStudentName('');
          }
        }}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  variant,
}: {
  label: string;
  value: string | number;
  variant?: 'success' | 'warning';
}) {
  return (
    <div className="border-2 border-border bg-background p-3 shadow-[2px_2px_0_var(--border)]">
      <span className="block font-black text-[10px] text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
      <span
        className={cn(
          'mt-0.5 block font-black text-xl',
          variant === 'success' && 'text-dynamic-green',
          variant === 'warning' && 'text-dynamic-yellow'
        )}
      >
        {value}
      </span>
    </div>
  );
}

function SubmissionRow({
  submission,
  locale,
  t,
  onClick,
}: {
  submission: TeachTestSubmission;
  locale: string;
  t: ReturnType<typeof useTranslations>;
  onClick: () => void;
}) {
  const isSubmitted = !!submission.submittedAt;
  const scorePercent =
    submission.maxScore > 0 && submission.score !== null
      ? Math.round((submission.score / submission.maxScore) * 100)
      : null;

  return (
    <button
      onClick={onClick}
      type="button"
      className="flex w-full cursor-pointer select-none items-center gap-4 border-2 border-border bg-background p-4 text-left shadow-[2px_2px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[3px_3px_0_var(--border)]"
    >
      {/* Status icon */}
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center border-2 border-border',
          isSubmitted ? 'bg-dynamic-green/15' : 'bg-dynamic-yellow/15'
        )}
      >
        {isSubmitted ? (
          <CheckCircle className="h-5 w-5 text-dynamic-green" />
        ) : (
          <Clock className="h-5 w-5 text-dynamic-yellow" />
        )}
      </span>

      {/* Student info */}
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold text-sm">{submission.userName}</p>
        <p className="text-muted-foreground text-xs">
          {isSubmitted
            ? t('teachModules.submittedAt', {
                date: new Date(submission.submittedAt!).toLocaleString(locale, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }),
              })
            : t('teachModules.startedAt', {
                date: new Date(submission.startedAt).toLocaleString(locale, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }),
              })}
        </p>
      </div>

      {/* Answer progress */}
      <div className="hidden text-right md:block">
        <span className="block font-bold text-muted-foreground text-xs">
          {t('teachModules.answeredQuestions', {
            answered: submission.answeredCount,
            total: submission.totalQuizzes,
          })}
        </span>
        {isSubmitted && (
          <div className="mt-0.5 flex items-center justify-end gap-1">
            <CheckCircle className="h-3 w-3 text-dynamic-green" />
            <span className="font-bold text-dynamic-green text-xs">
              {submission.correctCount}
            </span>
            <XCircle className="ml-1 h-3 w-3 text-destructive" />
            <span className="font-bold text-destructive text-xs">
              {submission.answeredCount - submission.correctCount}
            </span>
          </div>
        )}
      </div>

      {/* Score */}
      {isSubmitted && scorePercent !== null && (
        <div
          className={cn(
            'flex h-12 w-12 shrink-0 items-center justify-center border-2 border-border font-black text-sm',
            scorePercent >= 70
              ? 'bg-dynamic-green/15 text-dynamic-green'
              : scorePercent >= 50
                ? 'bg-dynamic-yellow/15 text-dynamic-yellow'
                : 'bg-destructive/15 text-destructive'
          )}
        >
          {scorePercent}%
        </div>
      )}

      {!isSubmitted && (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center border-2 border-border bg-muted/20 font-bold text-muted-foreground text-xs">
          <Clock className="h-4 w-4" />
        </div>
      )}
    </button>
  );
}
