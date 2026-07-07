'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, Loader2, X, XCircle } from '@tuturuuu/icons';
import {
  getWorkspaceCourseModuleQuizSubmission,
  gradeWorkspaceCourseModuleQuizSubmission,
  type TeachModuleQuizSubmissionDetail,
} from '@tuturuuu/internal-api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { QuizSubmissionResponseViewer } from '@/components/quiz-submission-response-viewer';

interface LessonQuizSubmissionDetailDialogProps {
  courseId: string;
  moduleId: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  studentName: string;
  userId: string | null;
  wsId: string;
}

export function LessonQuizSubmissionDetailDialog({
  courseId,
  moduleId,
  onOpenChange,
  open,
  studentName,
  userId,
  wsId,
}: LessonQuizSubmissionDetailDialogProps) {
  const t = useTranslations();

  const { data, isLoading, isError } = useQuery({
    queryKey: [
      'course-module-quiz-submission-detail',
      wsId,
      courseId,
      moduleId,
      userId,
    ],
    queryFn: () =>
      userId
        ? getWorkspaceCourseModuleQuizSubmission(
            wsId,
            courseId,
            moduleId,
            userId
          )
        : Promise.reject('No user ID'),
    enabled: open && !!userId,
  });

  if (!open || !userId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-full overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 text-left">
              <DialogTitle>{t('teachModules.submissionDetails')}</DialogTitle>
              <DialogDescription>
                {t('teachModules.reviewingAnswersForStudent', { studentName })}
              </DialogDescription>
            </div>

            <button
              className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-border bg-background shadow-[2px_2px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[3px_3px_0_var(--border)]"
              onClick={() => onOpenChange(false)}
              type="button"
              aria-label={t('common.close') || 'Close'}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </DialogHeader>

        {isLoading && (
          <div className="flex h-64 flex-col items-center justify-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="font-bold text-muted-foreground text-sm">
              {t('teachModules.loadingSubmission')}
            </span>
          </div>
        )}

        {isError && (
          <div className="my-4 border-2 border-border border-dashed p-8 text-center shadow-[4px_4px_0_var(--border)]">
            <p className="font-bold text-muted-foreground text-sm">
              {t('teachModules.submissionDetailsLoadError')}
            </p>
          </div>
        )}

        {data && (
          <SubmissionContent
            detail={data}
            t={t}
            wsId={wsId}
            courseId={courseId}
            moduleId={moduleId}
            userId={userId}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SubmissionContent({
  detail,
  t,
  wsId,
  courseId,
  moduleId,
  userId,
}: {
  detail: TeachModuleQuizSubmissionDetail;
  t: ReturnType<typeof useTranslations>;
  wsId: string;
  courseId: string;
  moduleId: string;
  userId: string;
}) {
  const { answers, quizzes, summary } = detail;
  const completion =
    summary.totalQuizzes > 0
      ? Math.round((summary.answeredCount / summary.totalQuizzes) * 100)
      : 0;

  return (
    <div className="mt-4 space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label={t('teachModules.totalQuizQuestions')}
          value={summary.totalQuizzes}
        />
        <StatCard
          label={t('teachModules.answeredCountLabel')}
          value={summary.answeredCount}
          variant="warning"
        />
        <StatCard
          label={t('teachModules.correctAnswers')}
          value={summary.correctCount}
          variant="success"
        />
        <StatCard
          label={t('teachModules.completionRate')}
          value={`${completion}%`}
        />
      </div>

      <div className="space-y-6">
        <h3 className="border-border border-b-2 pb-2 font-black text-lg uppercase tracking-wider">
          {t('teachModules.questionResponses')}
        </h3>

        {quizzes.map((quiz, index) => {
          const quizAnswer =
            answers.find((answer) => answer.quiz_id === quiz.id) ?? null;
          const hasAnswer = Boolean(quizAnswer);
          const isCorrectAnswer = quizAnswer?.is_correct === true;
          const isPendingReview = hasAnswer && quizAnswer?.is_correct === null;
          const statusLabel = !hasAnswer
            ? t('teachModules.questionStatusNotAnswered')
            : isPendingReview
              ? t('teachModules.questionStatusPendingReview') || 'Pending Review'
              : isCorrectAnswer
                ? t('teachModules.questionStatusCorrect')
                : t('teachModules.questionStatusIncorrect');

          const statusClass = !hasAnswer
            ? 'border-border bg-muted/40 text-muted-foreground'
            : isPendingReview
              ? 'border-dynamic-yellow bg-dynamic-yellow/10 text-dynamic-yellow'
              : isCorrectAnswer
                ? 'border-dynamic-green bg-dynamic-green/10 text-dynamic-green-foreground'
                : 'border-dynamic-red bg-dynamic-red/10 text-dynamic-red-foreground';

          return (
            <div
              key={quiz.id}
              className="space-y-4 border-2 border-border bg-background p-5 shadow-[4px_4px_0_var(--border)]"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-border border-b-2 border-dashed pb-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center border-2 border-border font-black text-xs shadow-[1px_1px_0_var(--border)]">
                    {index + 1}
                  </span>
                  <h4 className="font-bold text-sm sm:text-base">
                    {quiz.question}
                  </h4>
                </div>

                <div
                  className={cn(
                    'border-2 px-2 py-0.5 font-bold text-xs shadow-[2px_2px_0_var(--border)]',
                    statusClass
                  )}
                >
                  {statusLabel}
                </div>
              </div>

              <div className="border-2 border-border border-dashed bg-muted/10 p-3.5 text-sm">
                <QuizSubmissionResponseViewer
                  answer={
                    quizAnswer ?? {
                      answer: null,
                      is_correct: null,
                      selected_option_id: null,
                    }
                  }
                  quiz={quiz}
                  t={t}
                />
              </div>

              {quiz.type === 'paragraph' && hasAnswer && (
                <ParagraphGradeControls
                  wsId={wsId}
                  courseId={courseId}
                  moduleId={moduleId}
                  userId={userId}
                  quizId={quiz.id}
                  currentIsCorrect={quizAnswer?.is_correct ?? null}
                  currentFeedback={quizAnswer?.feedback}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ParagraphGradeControls({
  wsId,
  courseId,
  moduleId,
  userId,
  quizId,
  currentIsCorrect,
  currentFeedback,
}: {
  wsId: string;
  courseId: string;
  moduleId: string;
  userId: string;
  quizId: string;
  currentIsCorrect: boolean | null;
  currentFeedback?: string | null;
}) {
  const t = useTranslations();
  const qc = useQueryClient();
  const [feedback, setFeedback] = useState(currentFeedback ?? '');
  const [isGrading, setIsGrading] = useState(false);

  const handleGrade = async (isCorrect: boolean) => {
    setIsGrading(true);
    try {
      await gradeWorkspaceCourseModuleQuizSubmission(
        wsId,
        courseId,
        moduleId,
        userId,
        {
          quizId,
          isCorrect,
          feedback: feedback.trim() || undefined,
        }
      );
      toast.success(t('teachModules.gradedSuccess') || 'Graded successfully');

      // Invalidate queries so stats and details refresh
      await Promise.all([
        qc.invalidateQueries({
          queryKey: [
            'course-module-quiz-submission-detail',
            wsId,
            courseId,
            moduleId,
            userId,
          ],
        }),
        qc.invalidateQueries({
          queryKey: [
            'course-module-quiz-submissions',
            wsId,
            courseId,
            moduleId,
          ],
        }),
      ]);
    } catch (err) {
      toast.error(
        t('teachModules.gradedError') || 'Failed to grade submission'
      );
      console.error(err);
    } finally {
      setIsGrading(false);
    }
  };

  return (
    <div className="mt-4 border-2 border-border bg-muted/20 p-4 space-y-3 shadow-[2px_2px_0_var(--border)]">
      <div className="space-y-1">
        <label className="block font-bold text-xs uppercase tracking-widest text-muted-foreground">
          {t('teachModules.feedback') || 'Teacher Feedback'}
        </label>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          disabled={isGrading}
          rows={2}
          placeholder={
            t('teachModules.feedbackPlaceholder') ||
            'Enter feedback for student...'
          }
          className="w-full border-2 border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => handleGrade(true)}
          disabled={isGrading}
          className={cn(
            'inline-flex items-center gap-1.5 border-2 border-border px-3 py-1.5 font-bold text-xs shadow-[2px_2px_0_var(--border)] transition hover:-translate-y-0.5',
            currentIsCorrect === true
              ? 'bg-dynamic-green/20 text-dynamic-green'
              : 'bg-background hover:bg-muted/30'
          )}
          type="button"
        >
          <CheckCircle className="h-4 w-4" />
          {t('teachModules.markCorrect') || 'Mark Correct'}
        </button>

        <button
          onClick={() => handleGrade(false)}
          disabled={isGrading}
          className={cn(
            'inline-flex items-center gap-1.5 border-2 border-border px-3 py-1.5 font-bold text-xs shadow-[2px_2px_0_var(--border)] transition hover:-translate-y-0.5',
            currentIsCorrect === false
              ? 'bg-destructive/20 text-destructive'
              : 'bg-background hover:bg-muted/30'
          )}
          type="button"
        >
          <XCircle className="h-4 w-4" />
          {t('teachModules.markIncorrect') || 'Mark Incorrect'}
        </button>
      </div>
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
    <div className="border-2 border-border bg-background p-4 text-center shadow-[3px_3px_0_var(--border)]">
      <span className="block font-black text-[10px] text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
      <span
        className={cn(
          'mt-1 block font-black text-2xl',
          variant === 'success' && 'text-dynamic-green',
          variant === 'warning' && 'text-dynamic-yellow'
        )}
      >
        {value}
      </span>
    </div>
  );
}
