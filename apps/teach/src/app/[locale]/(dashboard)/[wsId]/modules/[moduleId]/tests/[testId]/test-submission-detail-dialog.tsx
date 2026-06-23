'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, X } from '@tuturuuu/icons';
import {
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
import { useEffect, useState } from 'react';

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

type SubmissionQuiz = TeachTestSubmissionDetail['quizzes'][number];
type SubmissionAnswer = TeachTestSubmissionDetail['answers'][number];
type MatchingPair = { left: string; right: string };
type MultipleChoiceOption = {
  id: string;
  index: number | null;
  value: string;
};

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
              <div className="border-2 border-border border-dashed bg-muted/10 p-3.5 text-sm">
                <ResponseViewer quiz={quiz} answer={quizAns} t={t} />
              </div>

              {/* Teacher feedback form */}
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
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Sub-component to render student's responses
function ResponseViewer({
  quiz,
  answer,
  t,
}: {
  quiz: SubmissionQuiz;
  answer: SubmissionAnswer;
  t: ReturnType<typeof useTranslations>;
}) {
  const getParsedContent = (content: unknown): unknown => {
    if (typeof content === 'string') {
      try {
        return JSON.parse(content);
      } catch {
        return null;
      }
    }
    return content;
  };

  const asRecord = (value: unknown): Record<string, unknown> | null => {
    const parsedValue = getParsedContent(value);
    if (
      !parsedValue ||
      typeof parsedValue !== 'object' ||
      Array.isArray(parsedValue)
    )
      return null;
    return parsedValue as Record<string, unknown>;
  };

  const displayText = (value: unknown): string => {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean')
      return String(value);
    return '';
  };

  const getArrayProperty = (value: unknown, key: string): unknown[] => {
    const property = asRecord(value)?.[key];
    return Array.isArray(property) ? property : [];
  };

  const getStringItems = (value: unknown, key: string): string[] => {
    return getArrayProperty(value, key).map(displayText);
  };

  const getMatchingPairs = (value: unknown): MatchingPair[] => {
    const parsedValue = getParsedContent(value);
    const pairs = Array.isArray(parsedValue)
      ? parsedValue
      : getArrayProperty(parsedValue, 'pairs');
    return pairs
      .map((pair) => {
        const record = asRecord(pair);
        return {
          left: displayText(record?.left),
          right: displayText(record?.right),
        };
      })
      .filter((pair) => Boolean(pair.left && pair.right));
  };

  const getSelectedIndexAnswer = (value: unknown) => {
    const selectedIndex = asRecord(value)?.selectedIndex;
    return typeof selectedIndex === 'number' ? selectedIndex : null;
  };

  const getTrueFalseAnswer = (value: unknown) => {
    if (typeof value === 'boolean') return value;

    const correct = asRecord(value)?.correct;
    return typeof correct === 'boolean' ? correct : null;
  };

  const getAnswerOrder = (value: unknown, fallback: string[]) => {
    if (Array.isArray(value)) return value.map(displayText).filter(Boolean);

    const order = getStringItems(value, 'order');
    return order.length > 0 ? order : fallback;
  };

  const getMultipleChoiceOptions = (
    quiz: SubmissionQuiz
  ): MultipleChoiceOption[] => {
    const contentOptions = getArrayProperty(quiz.content, 'options');

    const parsedContentOptions = contentOptions
      .map((option: unknown, index: number) => ({
        id: `content-${index}`,
        value: displayText(option),
        index,
      }))
      .filter((opt: { id: string; value: string; index: number }) =>
        Boolean(opt.value)
      );

    if (parsedContentOptions.length > 0) {
      return parsedContentOptions;
    }

    return (quiz.quiz_options ?? []).map((option) => ({
      id: option.id,
      value: option.value,
      index: null,
    }));
  };

  const isCorrect = answer.is_correct;

  if (!quiz.type || quiz.type === 'multiple_choice') {
    const options = getMultipleChoiceOptions(quiz);
    return (
      <div className="space-y-2">
        <p className="mb-1 font-bold text-muted-foreground text-xs uppercase tracking-wider">
          {t('teachModules.studentChoice')}
        </p>
        {options.map((opt) => {
          const isSelected =
            answer.selected_option_id === opt.id ||
            (opt.index !== null &&
              getSelectedIndexAnswer(answer.answer) === opt.index);

          const rawOpt = quiz.quiz_options?.find((o) => o.id === opt.id);
          const isOptionCorrect = rawOpt?.is_correct ?? false;

          let optionStyle = 'border-border bg-background';
          if (isSelected) {
            optionStyle = isCorrect
              ? 'border-dynamic-green bg-dynamic-green/10 text-dynamic-green-foreground'
              : 'border-dynamic-red bg-dynamic-red/10 text-dynamic-red-foreground';
          } else if (isOptionCorrect) {
            optionStyle =
              'border-dynamic-green bg-dynamic-green/5 border-dashed text-dynamic-green-foreground';
          }

          return (
            <div
              key={opt.id}
              className={cn(
                'flex items-center justify-between border-2 p-3 shadow-[1px_1px_0_var(--border)]',
                optionStyle
              )}
            >
              <span className="font-bold text-sm">{opt.value}</span>
              {isSelected && (
                <span className="font-black text-xs uppercase tracking-wider">
                  {isCorrect
                    ? t('teachModules.selectedCorrectAnswer')
                    : t('teachModules.selectedIncorrectAnswer')}
                </span>
              )}
              {!isSelected && isOptionCorrect && (
                <span className="font-bold text-muted-foreground text-xs uppercase tracking-wider">
                  {t('teachModules.correctAnswerLabel')}
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  if (quiz.type === 'true_false') {
    const studentVal = getTrueFalseAnswer(answer.answer);
    const options = [
      { label: t('ws-quizzes.true'), value: true },
      { label: t('ws-quizzes.false'), value: false },
    ];

    return (
      <div className="space-y-2">
        <p className="mb-1 font-bold text-muted-foreground text-xs uppercase tracking-wider">
          {t('teachModules.studentAnswer')}
        </p>
        <div className="grid grid-cols-2 gap-3">
          {options.map((opt) => {
            const isSelected = studentVal === opt.value;
            let optionStyle = 'border-border bg-background';
            if (isSelected) {
              optionStyle = isCorrect
                ? 'border-dynamic-green bg-dynamic-green/10 text-dynamic-green-foreground'
                : 'border-dynamic-red bg-dynamic-red/10 text-dynamic-red-foreground';
            } else if (studentVal !== null && !isSelected && !isCorrect) {
              optionStyle =
                'border-dynamic-green bg-dynamic-green/5 border-dashed text-dynamic-green-foreground';
            }

            return (
              <div
                key={String(opt.value)}
                className={cn(
                  'flex items-center justify-center border-2 py-3 font-bold text-sm shadow-[1px_1px_0_var(--border)]',
                  optionStyle
                )}
              >
                {opt.label}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (quiz.type === 'ordering') {
    const items = getStringItems(quiz.content, 'items');
    const submittedOrder = getAnswerOrder(answer.answer, items);

    return (
      <div className="space-y-2">
        <p className="mb-1 font-bold text-muted-foreground text-xs uppercase tracking-wider">
          {t('teachModules.studentOrder')}
        </p>
        <div className="space-y-2">
          {submittedOrder.map((item: string, idx: number) => (
            <div
              key={`${item}-${idx}`}
              className={cn(
                'flex items-center gap-3 border-2 p-3 text-sm shadow-[1px_1px_0_var(--border)]',
                isCorrect
                  ? 'border-dynamic-green bg-dynamic-green/10'
                  : 'border-dynamic-red bg-dynamic-red/10'
              )}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center border-2 border-border bg-primary font-black text-[10px] text-primary-foreground">
                {idx + 1}
              </span>
              <span className="font-bold">{item}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (quiz.type === 'matching') {
    const pairs = getMatchingPairs(quiz.content);
    const submittedPairs = getMatchingPairs(answer.answer);

    return (
      <div className="space-y-2">
        <p className="mb-1 font-bold text-muted-foreground text-xs uppercase tracking-wider">
          {t('teachModules.studentMatchings')}
        </p>
        <div className="space-y-2">
          {pairs.map((pair, idx) => {
            const currentRight =
              submittedPairs.find((p) => p.left === pair.left)?.right || '—';
            return (
              <div
                key={`${pair.left}-${idx}`}
                className={cn(
                  'grid gap-3 border-2 p-3 text-sm shadow-[1px_1px_0_var(--border)] md:grid-cols-[1fr_1fr] md:items-center',
                  isCorrect
                    ? 'border-dynamic-green bg-dynamic-green/10'
                    : 'border-dynamic-red bg-dynamic-red/10'
                )}
              >
                <span className="font-bold">{pair.left}</span>
                <div className="border-2 border-border bg-background p-2 font-bold text-sm">
                  {currentRight}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (quiz.type === 'paragraph') {
    const text = asRecord(answer.answer)?.text;
    const textValue = typeof text === 'string' && text.trim() ? text : '—';
    return (
      <div className="space-y-2">
        <p className="mb-1 font-bold text-muted-foreground text-xs uppercase tracking-wider">
          {t('teachModules.studentResponse')}
        </p>
        <div className="w-full whitespace-pre-wrap border-2 border-border bg-background p-3 font-bold text-sm">
          {textValue}
        </div>
      </div>
    );
  }

  return null;
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
}) {
  const qc = useQueryClient();
  const [feedback, setFeedback] = useState(initialFeedback);
  const [scoreAwarded, setScoreAwarded] = useState(String(initialScoreAwarded));

  useEffect(() => {
    setFeedback(initialFeedback);
    setScoreAwarded(String(initialScoreAwarded));
  }, [initialFeedback, initialScoreAwarded]);

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
      <label className="block font-black text-muted-foreground text-xs uppercase tracking-wider">
        {t('teachModules.questionFeedback')}
      </label>
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
          onChange={(e) => setFeedback(e.target.value)}
          placeholder={t('teachModules.feedbackPlaceholder')}
          className="w-full resize-none border-2 border-border bg-background px-3 py-2 text-sm shadow-[2px_2px_0_var(--border)] outline-none focus:border-primary"
          disabled={feedbackMutation.isPending}
        />
        <button
          type="button"
          onClick={() => feedbackMutation.mutate()}
          disabled={feedbackMutation.isPending || !isChanged}
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
