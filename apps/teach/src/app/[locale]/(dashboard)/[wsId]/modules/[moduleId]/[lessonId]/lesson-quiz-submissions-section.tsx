'use client';

import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle,
  Clock,
  Eye,
  EyeOff,
  User,
  Users,
  XCircle,
} from '@tuturuuu/icons';
import {
  listWorkspaceCourseModuleQuizSubmissions,
  type TeachModuleQuizSubmission,
} from '@tuturuuu/internal-api';
import { cn } from '@tuturuuu/utils/format';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { LessonQuizSubmissionDetailDialog } from './lesson-quiz-submission-detail-dialog';

const toLocalDateTimeString = (dateStr: string | null | undefined) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60 * 1000);
  return localDate.toISOString().slice(0, 16);
};

interface LessonQuizSubmissionsSectionProps {
  courseId: string;
  moduleId: string;
  wsId: string;
  isQuizScorePublished?: boolean;
  onToggleQuizScorePublished?: (published: boolean) => void;
  quizDeadline?: string | null;
  onQuizDeadlineChange?: (deadline: string | null) => void;
  isSaving?: boolean;
}

export function LessonQuizSubmissionsSection({
  courseId,
  moduleId,
  wsId,
  isQuizScorePublished = false,
  onToggleQuizScorePublished,
  quizDeadline = null,
  onQuizDeadlineChange,
  isSaving = false,
}: LessonQuizSubmissionsSectionProps) {
  const locale = useLocale();
  const t = useTranslations();
  const [selectedStudentName, setSelectedStudentName] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const [localDeadline, setLocalDeadline] = useState<string>(() =>
    toLocalDateTimeString(quizDeadline)
  );

  useEffect(() => {
    setLocalDeadline(toLocalDateTimeString(quizDeadline));
  }, [quizDeadline]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['course-module-quiz-submissions', wsId, courseId, moduleId],
    queryFn: () =>
      listWorkspaceCourseModuleQuizSubmissions(wsId, courseId, moduleId),
  });

  const submissions = data?.data ?? [];
  const completed = submissions.filter(
    (submission) =>
      submission.totalQuizzes > 0 &&
      submission.answeredCount >= submission.totalQuizzes
  );
  const inProgress = submissions.filter(
    (submission) =>
      submission.totalQuizzes === 0 ||
      submission.answeredCount < submission.totalQuizzes
  );
  const averageCompletion =
    submissions.length > 0
      ? `${Math.round(
          (submissions.reduce((sum, submission) => {
            if (submission.totalQuizzes === 0) return sum;
            return sum + submission.answeredCount / submission.totalQuizzes;
          }, 0) /
            submissions.length) *
            100
        )}%`
      : '—';

  return (
    <section className="mt-8 space-y-4 border-2 border-border bg-background p-6 shadow-[5px_5px_0_var(--border)]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-dynamic-green" />
          <div>
            <h2 className="font-black text-lg">
              {t('teachModules.quizSubmissions')}
            </h2>
            <p className="text-muted-foreground text-sm">
              {t('teachModules.quizSubmissionsDescription')}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Quiz Deadline setting */}
          <div className="flex items-center gap-2 border-2 border-border bg-card px-2.5 py-1.5 text-xs shadow-[2px_2px_0_var(--border)]">
            <span className="font-bold text-muted-foreground">
              {t('teachModules.quizDeadline') || 'Deadline'}:
            </span>
            <input
              type="datetime-local"
              className="w-[145px] border-none bg-transparent p-0 font-bold text-foreground text-xs outline-none focus:ring-0"
              value={localDeadline}
              onChange={(e) => setLocalDeadline(e.target.value)}
              disabled={isSaving}
            />
            {localDeadline !== toLocalDateTimeString(quizDeadline) && (
              <div className="flex items-center gap-1.5 border-border border-l pl-2">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => {
                    const parsedDate = localDeadline
                      ? new Date(localDeadline)
                      : null;
                    if (parsedDate && Number.isNaN(parsedDate.getTime())) {
                      return;
                    }
                    onQuizDeadlineChange?.(
                      parsedDate ? parsedDate.toISOString() : null
                    );
                  }}
                  className="cursor-pointer font-black text-dynamic-green hover:underline disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() =>
                    setLocalDeadline(toLocalDateTimeString(quizDeadline))
                  }
                  className="cursor-pointer text-muted-foreground hover:underline disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => onToggleQuizScorePublished?.(!isQuizScorePublished)}
            type="button"
            className={cn(
              'inline-flex items-center gap-1.5 border-2 border-border px-3 py-1.5 font-bold text-xs shadow-[2px_2px_0_var(--border)] transition hover:-translate-y-0.5',
              isQuizScorePublished
                ? 'bg-dynamic-green/15 text-foreground'
                : 'bg-muted text-muted-foreground'
            )}
          >
            {isQuizScorePublished ? (
              <>
                <Eye className="h-3.5 w-3.5" />
                {t('teachModules.scoresPublishedToggle') || 'Scores Published'}
              </>
            ) : (
              <>
                <EyeOff className="h-3.5 w-3.5" />
                {t('teachModules.scoresHiddenToggle') || 'Scores Hidden'}
              </>
            )}
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, index) => (
            <div
              key={index}
              className="h-20 animate-pulse border-2 border-border bg-card shadow-[4px_4px_0_var(--border)]"
            />
          ))}
        </div>
      )}

      {!isLoading && isError && submissions.length === 0 && (
        <div className="border-2 border-border border-dashed bg-background p-8 text-center shadow-[4px_4px_0_var(--border)]">
          <p className="font-bold text-muted-foreground text-sm">
            {t('teachModules.submissionsLoadError')}
          </p>
        </div>
      )}

      {!isLoading && !isError && submissions.length === 0 && (
        <div className="border-2 border-border border-dashed bg-background p-8 text-center shadow-[4px_4px_0_var(--border)]">
          <User className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
          <p className="font-bold text-muted-foreground text-sm">
            {t('teachModules.noSubmissions')}
          </p>
          <p className="mt-1 text-muted-foreground text-xs">
            {t('teachModules.noQuizSubmissionsDescription')}
          </p>
        </div>
      )}

      {submissions.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard
              label={t('teachModules.totalLearners')}
              value={submissions.length}
            />
            <StatCard
              label={t('teachModules.completedCount')}
              value={completed.length}
              variant="success"
            />
            <StatCard
              label={t('teachModules.inProgressCount')}
              value={inProgress.length}
              variant="warning"
            />
            <StatCard
              label={t('teachModules.averageCompletion')}
              value={averageCompletion}
            />
          </div>

          {isError && (
            <p className="text-muted-foreground text-sm">
              {t('teachModules.submissionsLoadError')}
            </p>
          )}

          <div className="space-y-2">
            {submissions.map((submission) => (
              <SubmissionRow
                key={submission.userId}
                locale={locale}
                onClick={() => {
                  setSelectedStudentName(submission.userName);
                  setSelectedUserId(submission.userId);
                }}
                submission={submission}
                t={t}
              />
            ))}
          </div>
        </>
      )}

      <LessonQuizSubmissionDetailDialog
        courseId={courseId}
        moduleId={moduleId}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedStudentName('');
            setSelectedUserId(null);
          }
        }}
        open={!!selectedUserId}
        studentName={selectedStudentName}
        userId={selectedUserId}
        wsId={wsId}
      />
    </section>
  );
}

function SubmissionRow({
  locale,
  onClick,
  submission,
  t,
}: {
  locale: string;
  onClick: () => void;
  submission: TeachModuleQuizSubmission;
  t: ReturnType<typeof useTranslations>;
}) {
  const isCompleted =
    submission.totalQuizzes > 0 &&
    submission.answeredCount >= submission.totalQuizzes;
  const hasUnmarked = (submission.unmarkedCount ?? 0) > 0;
  const completionPercent =
    submission.totalQuizzes > 0
      ? Math.round((submission.answeredCount / submission.totalQuizzes) * 100)
      : 0;

  return (
    <button
      onClick={onClick}
      type="button"
      className="flex w-full cursor-pointer select-none items-center gap-4 border-2 border-border bg-background p-4 text-left shadow-[2px_2px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[3px_3px_0_var(--border)]"
    >
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center border-2 border-border',
          isCompleted
            ? hasUnmarked
              ? 'bg-dynamic-yellow/15'
              : 'bg-dynamic-green/15'
            : 'bg-dynamic-yellow/15'
        )}
      >
        {isCompleted && !hasUnmarked ? (
          <CheckCircle className="h-5 w-5 text-dynamic-green" />
        ) : (
          <Clock className="h-5 w-5 text-dynamic-yellow" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate font-bold text-sm">{submission.userName}</p>
        <p className="text-muted-foreground text-xs">
          {isCompleted
            ? t('teachModules.completedAt', {
                date: new Date(submission.lastSubmittedAt).toLocaleString(
                  locale,
                  {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }
                ),
              })
            : t('teachModules.lastActivityAt', {
                date: new Date(submission.lastSubmittedAt).toLocaleString(
                  locale,
                  {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }
                ),
              })}
        </p>
      </div>

      <div className="hidden text-right md:block">
        <span className="block font-bold text-muted-foreground text-xs">
          {t('teachModules.answeredQuestions', {
            answered: submission.answeredCount,
            total: submission.totalQuizzes,
          })}
        </span>
        <div className="mt-0.5 flex items-center justify-end gap-1">
          <CheckCircle className="h-3 w-3 text-dynamic-green" />
          <span className="font-bold text-dynamic-green text-xs">
            {submission.correctCount}
          </span>
          <XCircle className="ml-1 h-3 w-3 text-destructive" />
          <span className="font-bold text-destructive text-xs">
            {Math.max(
              submission.answeredCount -
                submission.correctCount -
                (submission.unmarkedCount ?? 0),
              0
            )}
          </span>
          {(submission.unmarkedCount ?? 0) > 0 && (
            <>
              <Clock className="ml-1 h-3 w-3 text-dynamic-yellow" />
              <span className="font-bold text-dynamic-yellow text-xs">
                {submission.unmarkedCount}
              </span>
            </>
          )}
        </div>
      </div>

      <div
        className={cn(
          'flex h-12 w-12 shrink-0 items-center justify-center border-2 border-border font-black text-sm',
          isCompleted
            ? 'bg-dynamic-green/15 text-dynamic-green'
            : completionPercent >= 50
              ? 'bg-dynamic-yellow/15 text-dynamic-yellow'
              : 'bg-destructive/15 text-destructive'
        )}
      >
        {completionPercent}%
      </div>
    </button>
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
