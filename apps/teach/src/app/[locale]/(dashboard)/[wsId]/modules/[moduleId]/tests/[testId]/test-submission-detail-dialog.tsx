'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, X } from '@tuturuuu/icons';
import {
  generateWorkspaceCourseTestSubmissionFeedback,
  getWorkspaceCourseTestSubmission,
  type TeachTestSubmissionDetail,
  updateWorkspaceCourseTestSubmissionFeedback,
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
import { useEffect, useRef, useState } from 'react';
import { QuizSubmissionResponseViewer } from '@/components/quiz-submission-response-viewer';

interface TestSubmissionDetailDialogProps {
  wsId: string;
  courseId: string;
  testId: string;
  attemptId: string | null;
  studentName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TestSubmissionDetailDialog({
  wsId,
  courseId,
  testId,
  attemptId,
  studentName,
  open,
  onOpenChange,
}: TestSubmissionDetailDialogProps) {
  const t = useTranslations();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['teach-submission-detail', wsId, courseId, testId, attemptId],
    queryFn: () =>
      attemptId
        ? getWorkspaceCourseTestSubmission(wsId, courseId, testId, attemptId)
        : Promise.reject('No attempt ID'),
    enabled: open && !!attemptId,
  });

  if (!open || !attemptId) return null;

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
            wsId={wsId}
            courseId={courseId}
            testId={testId}
            attemptId={attemptId}
            detail={data}
            t={t}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface SubmissionContentProps {
  wsId: string;
  courseId: string;
  testId: string;
  attemptId: string;
  detail: TeachTestSubmissionDetail;
  t: ReturnType<typeof useTranslations>;
}

function SubmissionContent({
  wsId,
  courseId,
  testId,
  attemptId,
  detail,
  t,
}: SubmissionContentProps) {
  const { attempt, quizzes, answers } = detail;

  const maxScore = quizzes.reduce((sum, q) => sum + (q.score ?? 0), 0);
  const studentScore = attempt.score ?? 0;
  const percentage =
    maxScore > 0 ? Math.round((studentScore / maxScore) * 100) : 0;

  const correctAnswers = answers.filter((a) => a.is_correct === true).length;
  const incorrectAnswers = answers.filter((a) => a.is_correct === false).length;

  const [aiFeedbacks, setAiFeedbacks] = useState<Record<string, string>>({});
  const pendingAiQuizIdsRef = useRef(new Set<string>());
  const [pendingAiQuizIds, setPendingAiQuizIds] = useState<Set<string>>(
    () => new Set()
  );
  const aiFeedbackMutation = useMutation({
    mutationFn: (quizId: string) =>
      generateWorkspaceCourseTestSubmissionFeedback(
        wsId,
        courseId,
        testId,
        attemptId,
        { quizId }
      ),
    onSuccess: (result, quizId) => {
      setAiFeedbacks((prev) => ({ ...prev, [quizId]: result.feedback }));
      toast.success(t('teachModules.aiFeedbackGenerated'));
    },
    onError: () => {
      toast.error(t('teachModules.aiFeedbackError'));
    },
    onSettled: (_data, _error, quizId) => {
      pendingAiQuizIdsRef.current.delete(quizId);
      setPendingAiQuizIds(new Set(pendingAiQuizIdsRef.current));
    },
  });

  const generateAiFeedback = (quizId: string) => {
    if (pendingAiQuizIdsRef.current.has(quizId)) return;

    pendingAiQuizIdsRef.current.add(quizId);
    setPendingAiQuizIds(new Set(pendingAiQuizIdsRef.current));
    aiFeedbackMutation.mutate(quizId);
  };

  return (
    <div className="mt-4 space-y-6">
      {/* Stats summary row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="border-2 border-border bg-background p-4 text-center shadow-[3px_3px_0_var(--border)]">
          <span className="block font-black text-[10px] text-muted-foreground uppercase tracking-wider">
            {t('teachModules.attemptScore')}
          </span>
          <span className="mt-1 block font-black text-2xl">
            {studentScore} / {maxScore}
          </span>
        </div>

        <div className="border-2 border-border bg-background p-4 text-center shadow-[3px_3px_0_var(--border)]">
          <span className="block font-black text-[10px] text-muted-foreground uppercase tracking-wider">
            {t('teachModules.percentage')}
          </span>
          <span className="mt-1 block font-black text-2xl text-primary">
            {percentage}%
          </span>
        </div>

        <div className="border-2 border-border bg-background p-4 text-center shadow-[3px_3px_0_var(--border)]">
          <span className="block font-black text-[10px] text-muted-foreground uppercase tracking-wider">
            {t('teachModules.correctAnswers')}
          </span>
          <span className="mt-1 block font-black text-2xl text-dynamic-green">
            {correctAnswers}
          </span>
        </div>

        <div className="border-2 border-border bg-background p-4 text-center shadow-[3px_3px_0_var(--border)]">
          <span className="block font-black text-[10px] text-muted-foreground uppercase tracking-wider">
            {t('teachModules.incorrectAnswers')}
          </span>
          <span className="mt-1 block font-black text-2xl text-destructive">
            {incorrectAnswers}
          </span>
        </div>
      </div>

      {/* Quizzes list review */}
      <div className="space-y-6">
        <h3 className="border-border border-b-2 pb-2 font-black text-lg uppercase tracking-wider">
          {t('teachModules.questionResponsesFeedback')}
        </h3>

        {quizzes.map((quiz, index) => {
          const quizAns = answers.find((a) => a.quiz_id === quiz.id) || {
            quiz_id: quiz.id,
            selected_option_id: null,
            answer: null,
            is_correct: false,
            score_awarded: 0,
            feedback: '',
          };

          return (
            <div
              key={quiz.id}
              className="space-y-4 border-2 border-border bg-background p-5 shadow-[4px_4px_0_var(--border)]"
            >
              {/* Question header */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-border border-b-2 border-dashed pb-3">
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center border-2 border-border font-black text-xs shadow-[1px_1px_0_var(--border)]',
                      quizAns.is_correct
                        ? 'bg-dynamic-green/15 text-dynamic-green-foreground'
                        : 'bg-dynamic-red/15 text-dynamic-red-foreground'
                    )}
                  >
                    {index + 1}
                  </span>
                  <h4 className="font-bold text-sm sm:text-base">
                    {quiz.question}
                  </h4>
                </div>
                <div
                  className={cn(
                    'border-2 border-border px-2 py-0.5 font-bold text-xs shadow-[2px_2px_0_var(--border)]',
                    quizAns.is_correct
                      ? 'border-dynamic-green bg-dynamic-green/10 text-dynamic-green-foreground'
                      : 'border-dynamic-red bg-dynamic-red/10 text-dynamic-red-foreground'
                  )}
                >
                  {t('teachModules.questionScore', {
                    score: quizAns.score_awarded ?? 0,
                    total: quiz.score ?? t('teachModules.noScoreLimit'),
                  })}
                </div>
              </div>

              {/* Student response render */}
              <div
                onClick={(e) => e.stopPropagation()}
                className="cursor-default border-2 border-border border-dashed bg-muted/10 p-3.5 text-sm"
              >
                <QuizSubmissionResponseViewer
                  quiz={quiz}
                  answer={quizAns}
                  t={t}
                />
              </div>

              {/* Teacher feedback form */}
              <div
                onClick={(e) => e.stopPropagation()}
                className="cursor-default"
              >
                <FeedbackForm
                  wsId={wsId}
                  courseId={courseId}
                  testId={testId}
                  attemptId={attemptId}
                  quizId={quiz.id}
                  initialScoreAwarded={quizAns.score_awarded ?? 0}
                  initialFeedback={quizAns.feedback || ''}
                  isParagraph={quiz.type === 'paragraph'}
                  maxScore={quiz.score}
                  t={t}
                  aiFeedback={aiFeedbacks[quiz.id]}
                  isAiDisabled={pendingAiQuizIds.size > 0}
                  isAiLoading={pendingAiQuizIds.has(quiz.id)}
                  onGenerateAi={() => generateAiFeedback(quiz.id)}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Sub-component to manage feedback form state per quiz
function FeedbackForm({
  wsId,
  courseId,
  testId,
  attemptId,
  quizId,
  initialScoreAwarded,
  initialFeedback,
  isParagraph,
  maxScore,
  t,
  aiFeedback,
  isAiDisabled,
  isAiLoading,
  onGenerateAi,
}: {
  wsId: string;
  courseId: string;
  testId: string;
  attemptId: string;
  quizId: string;
  initialScoreAwarded: number;
  initialFeedback: string;
  isParagraph: boolean;
  maxScore: number | null;
  t: ReturnType<typeof useTranslations>;
  aiFeedback?: string;
  isAiDisabled?: boolean;
  isAiLoading?: boolean;
  onGenerateAi?: () => void;
}) {
  const qc = useQueryClient();
  const [feedback, setFeedback] = useState(initialFeedback);
  const [hasManualEdit, setHasManualEdit] = useState(false);
  const [scoreAwarded, setScoreAwarded] = useState(String(initialScoreAwarded));

  useEffect(() => {
    setFeedback(initialFeedback);
    setHasManualEdit(false);
    setScoreAwarded(String(initialScoreAwarded));
  }, [initialFeedback, initialScoreAwarded]);

  useEffect(() => {
    if (aiFeedback && !hasManualEdit) {
      setFeedback(aiFeedback);
    }
  }, [aiFeedback, hasManualEdit]);

  const parseManualScore = () => {
    const parsed = scoreAwarded.trim() ? Number(scoreAwarded) : 0;
    if (
      !Number.isFinite(parsed) ||
      parsed < 0 ||
      (maxScore !== null && parsed > maxScore)
    ) {
      throw new Error(t('teachModules.invalidManualScore'));
    }

    return parsed;
  };

  const feedbackMutation = useMutation({
    mutationFn: () => {
      const payload: Parameters<
        typeof updateWorkspaceCourseTestSubmissionFeedback
      >[4] = {
        quizId,
        feedback: feedback.trim() || null,
      };

      if (isParagraph) {
        const manualScore = parseManualScore();
        payload.scoreAwarded = manualScore;
        payload.isCorrect = manualScore > 0;
      }

      return updateWorkspaceCourseTestSubmissionFeedback(
        wsId,
        courseId,
        testId,
        attemptId,
        payload
      );
    },
    onSuccess: () => {
      toast.success(t('teachModules.feedbackSaved'));
      qc.invalidateQueries({
        queryKey: [
          'teach-submission-detail',
          wsId,
          courseId,
          testId,
          attemptId,
        ],
      });
      qc.invalidateQueries({
        queryKey: ['course-test-submissions', wsId, courseId, testId],
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : t('teachModules.feedbackError')
      );
    },
  });

  const isFeedbackChanged = feedback.trim() !== (initialFeedback || '').trim();
  const isScoreChanged =
    isParagraph &&
    (scoreAwarded.trim() ? Number(scoreAwarded) : 0) !== initialScoreAwarded;
  const isChanged = isFeedbackChanged || isScoreChanged;

  return (
    <div className="space-y-2 border-border border-t pt-2">
      <div className="flex items-center justify-between">
        <label className="block font-black text-muted-foreground text-xs uppercase tracking-wider">
          {t('teachModules.questionFeedback')}
        </label>
        <button
          type="button"
          onClick={onGenerateAi}
          disabled={isAiDisabled || isAiLoading || feedbackMutation.isPending}
          className="inline-flex cursor-pointer items-center gap-1 border border-border bg-background px-2 py-0.5 font-bold text-foreground text-xs shadow-[1px_1px_0_var(--border)] transition hover:-translate-y-0.5 disabled:opacity-50"
        >
          {isAiLoading ? (
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
          ) : (
            t('teachModules.generateAiFeedback')
          )}
        </button>
      </div>
      {isParagraph && (
        <div className="max-w-xs space-y-1">
          <label
            className="block font-bold text-muted-foreground text-xs"
            htmlFor={`manual-score-${quizId}`}
          >
            {t('teachModules.manualScore')}
          </label>
          <input
            id={`manual-score-${quizId}`}
            className="w-full border-2 border-border bg-background px-3 py-2 text-sm shadow-[2px_2px_0_var(--border)] outline-none focus:border-primary"
            disabled={feedbackMutation.isPending}
            max={maxScore ?? undefined}
            min={0}
            onChange={(event) => setScoreAwarded(event.target.value)}
            step={0.5}
            type="number"
            value={scoreAwarded}
          />
        </div>
      )}
      <div className="flex flex-col items-end gap-3 sm:flex-row">
        <textarea
          rows={2}
          value={feedback}
          onChange={(e) => {
            setFeedback(e.target.value);
            setHasManualEdit(true);
          }}
          placeholder={t('teachModules.feedbackPlaceholder')}
          className="w-full resize-none border-2 border-border bg-background px-3 py-2 text-sm shadow-[2px_2px_0_var(--border)] outline-none focus:border-primary"
          disabled={feedbackMutation.isPending || isAiLoading}
        />
        <button
          type="button"
          onClick={() => feedbackMutation.mutate()}
          disabled={feedbackMutation.isPending || !isChanged || isAiLoading}
          className={cn(
            'inline-flex w-full shrink-0 cursor-pointer items-center justify-center gap-2 border-2 border-border px-4 py-2.5 font-bold text-sm shadow-[2px_2px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[3px_3px_0_var(--border)] active:translate-y-0 active:shadow-[1px_1px_0_var(--border)] disabled:opacity-50 sm:w-auto',
            isFeedbackChanged
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground'
          )}
        >
          {feedbackMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('common.saving')}
            </>
          ) : (
            t('teachModules.saveFeedback')
          )}
        </button>
      </div>
    </div>
  );
}
