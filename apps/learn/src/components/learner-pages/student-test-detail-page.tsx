'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpenCheck,
  Calendar,
  ChevronLeft,
  Clock,
  GraduationCap,
  Layers,
  Play,
} from '@tuturuuu/icons';
import {
  getTulearnCourse,
  getTulearnTestAttempt,
  saveTulearnTestAnswer,
  startTulearnTest,
  submitTulearnTest,
} from '@tuturuuu/internal-api';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import {
  EmptyState,
  LoadingState,
  useStudentHref,
  useStudentId,
} from './shared';

interface StudentTestDetailPageProps {
  wsId: string;
  courseId: string;
  testId: string;
}

function getParsedContent(content: unknown): any {
  if (typeof content === 'string') {
    try {
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
  return content;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  const parsedValue = getParsedContent(value);
  if (
    !parsedValue ||
    typeof parsedValue !== 'object' ||
    Array.isArray(parsedValue)
  )
    return null;
  return parsedValue as Record<string, unknown>;
}

function displayText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

function getArrayProperty(value: unknown, key: string): unknown[] {
  const property = asRecord(value)?.[key];
  return Array.isArray(property) ? property : [];
}

function getStringItems(value: unknown, key: string): string[] {
  return getArrayProperty(value, key).map(displayText);
}

function getMatchingPairs(value: unknown): { left: string; right: string }[] {
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
}

function getMultipleChoiceOptions(
  quiz: any
): { id: string; value: string; index: number | null }[] {
  const parsedContent = getParsedContent(quiz?.content);
  const contentOptions = Array.isArray(parsedContent?.options)
    ? parsedContent.options
    : [];

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

  return (quiz?.quiz_options ?? []).map((option: any) => ({
    id: option.id,
    value: option.value,
    index: null,
  }));
}

export function StudentTestDetailPage({
  wsId,
  courseId,
  testId,
}: StudentTestDetailPageProps) {
  const t = useTranslations();
  const studentId = useStudentId();
  const courseHref = useStudentHref(`/${wsId}/courses/${courseId}`);
  const queryClient = useQueryClient();

  // Fetch course details which includes tests
  const courseQuery = useQuery({
    queryKey: ['tulearn', wsId, studentId, 'course', courseId],
    queryFn: () => getTulearnCourse(wsId, courseId, studentId),
  });

  // Fetch active or completed test attempt
  const attemptQuery = useQuery({
    queryKey: ['tulearn', wsId, studentId, 'test-attempt', testId],
    queryFn: () => getTulearnTestAttempt(wsId, courseId, testId, studentId),
  });

  const test = courseQuery.data?.tests?.find((t) => t.id === testId);
  const testModules = (courseQuery.data?.modules ?? []).filter((m) =>
    test?.module_ids?.includes(m.id)
  );

  const attempt = attemptQuery.data?.attempt;
  const quizzes = attemptQuery.data?.quizzes ?? [];
  const initialAnswers = attemptQuery.data?.answers ?? [];

  // Local state for answers
  const [localAnswers, setLocalAnswers] = useState<
    Record<string, { selectedOptionId: string | null; answer: any }>
  >({});

  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [hasStarted, setHasStarted] = useState<boolean>(true);

  // Check if test has started
  useEffect(() => {
    if (!test?.start_at) {
      setHasStarted(true);
      return;
    }

    const checkStarted = () => {
      const startTime = new Date(test.start_at!).getTime();
      const now = Date.now();
      setHasStarted(now >= startTime);
    };

    checkStarted();
    const interval = setInterval(checkStarted, 1000);
    return () => clearInterval(interval);
  }, [test?.start_at]);

  // Initialize local answers when query loads
  useEffect(() => {
    if (initialAnswers.length > 0) {
      const answersMap: Record<
        string,
        { selectedOptionId: string | null; answer: any }
      > = {};
      for (const ans of initialAnswers) {
        answersMap[ans.quiz_id] = {
          selectedOptionId: ans.selected_option_id,
          answer: ans.answer,
        };
      }
      setLocalAnswers(answersMap);
    }
  }, [initialAnswers]);

  // Mutations
  const startMutation = useMutation({
    mutationFn: () => startTulearnTest(wsId, courseId, testId, studentId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['tulearn', wsId, studentId, 'test-attempt', testId],
      });
      toast.success(t('courses.submitTestSuccess'));
    },
    onError: () => {
      toast.error('Failed to start test');
    },
  });

  const saveAnswerMutation = useMutation({
    mutationFn: (payload: {
      attemptId: string;
      quizId: string;
      selectedOptionId?: string | null;
      answer?: unknown;
    }) => saveTulearnTestAnswer(wsId, courseId, testId, payload, studentId),
    onError: () => {
      toast.error(t('courses.saveError'));
    },
  });

  const submitMutation = useMutation({
    mutationFn: (payload: { attemptId: string }) =>
      submitTulearnTest(wsId, courseId, testId, payload, studentId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['tulearn', wsId, studentId, 'test-attempt', testId],
      });
      toast.success(t('courses.submitTestSuccess'));
    },
    onError: () => {
      toast.error('Failed to submit test');
    },
  });

  const handleAutoSubmit = useCallback(() => {
    if (attempt && !attempt.submitted_at && !submitMutation.isPending) {
      submitMutation.mutate({ attemptId: attempt.id });
    }
  }, [attempt, submitMutation]);

  const handleManualSubmit = () => {
    if (!attempt || attempt.submitted_at || submitMutation.isPending) return;
    if (confirm(t('courses.submitTestConfirm'))) {
      submitMutation.mutate({ attemptId: attempt.id });
    }
  };

  // Timer Effect
  useEffect(() => {
    if (!attempt || attempt.submitted_at || !test?.duration_in_minutes) {
      setTimeLeft(null);
      return;
    }

    const durationMs = test.duration_in_minutes * 60 * 1000;
    const startedTime = new Date(attempt.started_at).getTime();
    const endTime = startedTime + durationMs;

    const updateTimer = () => {
      const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
      setTimeLeft(remaining);

      if (remaining <= 0) {
        handleAutoSubmit();
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [attempt, test, handleAutoSubmit]);

  // Prevent accidental navigation away during an active test
  useEffect(() => {
    if (!attempt || attempt.submitted_at) return;

    // beforeunload: catches refresh, tab close, URL bar navigation
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    // popstate: catches browser back button and swipe-back gestures.
    // Push a sentinel entry so pressing back fires popstate instead of leaving.
    const sentinel = { __testGuard: true };
    window.history.pushState(sentinel, '');

    const handlePopState = () => {
      // The user pressed back — ask for confirmation
      const leave = window.confirm(t('courses.leaveTestConfirm'));
      if (leave) {
        // Actually go back
        window.history.back();
      } else {
        // Stay on the page — re-push sentinel
        window.history.pushState(sentinel, '');
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [attempt, t]);

  if (courseQuery.isLoading || attemptQuery.isLoading) return <LoadingState />;

  if (courseQuery.isError || !courseQuery.data || !test) {
    return (
      <main className="min-h-screen bg-root-background px-5 py-5 text-foreground md:px-8">
        <EmptyState
          action={
            <Link
              href={courseHref}
              className="mt-4 inline-flex items-center gap-2 border-2 border-border bg-primary px-4 py-2 font-bold text-primary-foreground text-sm shadow-[2px_2px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[3px_3px_0_var(--border)]"
            >
              <ChevronLeft className="h-4 w-4" />
              {t('courses.backToCourse')}
            </Link>
          }
          label={t('courses.testNotFound')}
        />
      </main>
    );
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Render Completed / Submitted View
  if (attempt?.submitted_at) {
    return (
      <main className="min-h-screen bg-root-background px-5 py-5 text-foreground md:px-8">
        <div className="mx-auto max-w-xl space-y-6 border-2 border-border bg-background p-8 text-center shadow-[8px_8px_0_var(--border)]">
          <div className="mx-auto flex h-16 w-16 items-center justify-center border-2 border-border bg-dynamic-cyan/15 shadow-[4px_4px_0_var(--border)]">
            <GraduationCap className="h-8 w-8 text-foreground" />
          </div>

          <div className="space-y-2">
            <h2 className="font-black text-2xl uppercase tracking-wider">
              {t('courses.testSubmitted')}
            </h2>
            <p className="text-muted-foreground text-sm">
              {t('courses.testSubmittedDescription')}
            </p>
          </div>

          {attempt.score !== null && attempt.score !== undefined && (
            <div className="border-2 border-border bg-muted/20 p-4 shadow-[4px_4px_0_var(--border)]">
              <span className="block font-bold text-muted-foreground text-xs uppercase tracking-wider">
                {t('courses.quizEarnedPoints', {
                  points: attempt.score,
                  total: quizzes.length,
                })}
              </span>
              <span className="mt-1 block font-black text-3xl text-foreground">
                {attempt.score}
              </span>
            </div>
          )}

          <Link
            href={courseHref}
            className="inline-flex items-center gap-2 border-2 border-border bg-primary px-5 py-2.5 font-bold text-primary-foreground text-sm shadow-[3px_3px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--border)] active:translate-y-0 active:shadow-[1px_1px_0_var(--border)]"
          >
            <ChevronLeft className="h-4 w-4" />
            {t('courses.backToCourse')}
          </Link>
        </div>
      </main>
    );
  }

  // Render Active Test Taking View
  if (attempt) {
    const renderQuizInput = (quiz: any) => {
      const quizAns = localAnswers[quiz.id] || {
        selectedOptionId: null,
        answer: null,
      };

      if (!quiz.type || quiz.type === 'multiple_choice') {
        const options = getMultipleChoiceOptions(quiz);
        return (
          <div className="mt-4 space-y-2.5">
            {options.map((opt: any) => {
              const isChecked = quizAns.selectedOptionId === opt.id;
              return (
                <label
                  key={opt.id}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 border-2 border-border bg-background p-3.5 shadow-[2px_2px_0_var(--border)] transition hover:-translate-y-0.5 active:translate-y-0',
                    isChecked && 'border-dynamic-cyan bg-dynamic-cyan/10'
                  )}
                >
                  <input
                    type="radio"
                    name={`quiz-${quiz.id}`}
                    checked={isChecked}
                    onChange={() => {
                      const updatedAns =
                        opt.index !== null
                          ? { selectedIndex: opt.index }
                          : null;
                      const updated = {
                        selectedOptionId: opt.id,
                        answer: updatedAns,
                      };
                      setLocalAnswers((prev) => ({
                        ...prev,
                        [quiz.id]: updated,
                      }));
                      saveAnswerMutation.mutate({
                        attemptId: attempt.id,
                        quizId: quiz.id,
                        // Content-based options use non-UUID ids (e.g. "content-0");
                        // the DB column has a FK to quiz_options so we must send null
                        // and rely on answer.selectedIndex for grading.
                        selectedOptionId: opt.index !== null ? null : opt.id,
                        answer: updatedAns,
                      });
                    }}
                    className="mt-1"
                  />
                  <span className="font-bold text-sm">{opt.value}</span>
                </label>
              );
            })}
          </div>
        );
      }

      if (quiz.type === 'true_false') {
        const options = [
          { label: t('courses.quizTrue'), value: true },
          { label: t('courses.quizFalse'), value: false },
        ];
        return (
          <div className="mt-4 grid grid-cols-2 gap-3">
            {options.map((opt) => {
              const isChecked = quizAns.answer === opt.value;
              return (
                <button
                  key={String(opt.value)}
                  type="button"
                  onClick={() => {
                    const updated = {
                      selectedOptionId: null,
                      answer: opt.value,
                    };
                    setLocalAnswers((prev) => ({
                      ...prev,
                      [quiz.id]: updated,
                    }));
                    saveAnswerMutation.mutate({
                      attemptId: attempt.id,
                      quizId: quiz.id,
                      answer: opt.value,
                    });
                  }}
                  className={cn(
                    'flex cursor-pointer items-center justify-center border-2 border-border bg-background py-3 font-bold text-sm shadow-[2px_2px_0_var(--border)] transition hover:-translate-y-0.5 active:translate-y-0',
                    isChecked && 'border-dynamic-cyan bg-dynamic-cyan/10'
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        );
      }

      if (quiz.type === 'paragraph') {
        const textValue = (quizAns.answer as any)?.text || '';
        return (
          <div className="mt-4">
            <textarea
              value={textValue}
              onChange={(e) => {
                const val = e.target.value;
                const updated = {
                  selectedOptionId: null,
                  answer: { text: val },
                };
                setLocalAnswers((prev) => ({ ...prev, [quiz.id]: updated }));
              }}
              onBlur={() => {
                saveAnswerMutation.mutate({
                  attemptId: attempt.id,
                  quizId: quiz.id,
                  answer: { text: textValue },
                });
              }}
              rows={4}
              className="w-full border-2 border-border bg-background p-3 font-bold text-sm shadow-[2px_2px_0_var(--border)] focus:outline-none"
              placeholder="..."
            />
            <span className="mt-1 block text-[10px] text-muted-foreground italic">
              {t('courses.savingAnswer')}
            </span>
          </div>
        );
      }

      if (quiz.type === 'ordering') {
        const items = getStringItems(quiz.content, 'items');
        const orderList = Array.isArray(quizAns.answer)
          ? quizAns.answer
          : (quizAns.answer as any)?.order || items;

        const moveItem = (index: number, direction: 'up' | 'down') => {
          const targetIndex = direction === 'up' ? index - 1 : index + 1;
          if (targetIndex < 0 || targetIndex >= orderList.length) return;

          const newItems = [...orderList];
          const temp = newItems[index];
          newItems[index] = newItems[targetIndex];
          newItems[targetIndex] = temp;

          const updated = { selectedOptionId: null, answer: newItems };
          setLocalAnswers((prev) => ({ ...prev, [quiz.id]: updated }));
          saveAnswerMutation.mutate({
            attemptId: attempt.id,
            quizId: quiz.id,
            answer: newItems,
          });
        };

        return (
          <div className="mt-4 space-y-2">
            {orderList.map((item: string, index: number) => (
              <div
                key={`${item}-${index}`}
                className="flex items-center justify-between border-2 border-border bg-background p-3 text-sm shadow-[2px_2px_0_var(--border)]"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center border-2 border-border bg-primary font-black text-[10px] text-primary-foreground">
                    {index + 1}
                  </span>
                  <span className="font-bold">{item}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => moveItem(index, 'up')}
                    className="flex h-8 w-8 items-center justify-center border-2 border-border bg-background shadow-[1px_1px_0_var(--border)] hover:bg-muted/10 disabled:opacity-40"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={index === orderList.length - 1}
                    onClick={() => moveItem(index, 'down')}
                    className="flex h-8 w-8 items-center justify-center border-2 border-border bg-background shadow-[1px_1px_0_var(--border)] hover:bg-muted/10 disabled:opacity-40"
                  >
                    ↓
                  </button>
                </div>
              </div>
            ))}
          </div>
        );
      }

      if (quiz.type === 'matching') {
        const pairs = getMatchingPairs(quiz.content);
        let choices = getStringItems(quiz.content, 'choices');
        if (choices.length === 0) {
          choices = Array.from(new Set(pairs.map((p) => p.right))).filter(
            Boolean
          );
        }
        const submittedPairs = Array.isArray(quizAns.answer)
          ? quizAns.answer
          : (quizAns.answer as any)?.pairs ||
            pairs.map((p) => ({ left: p.left, right: '' }));

        const handleMatchingChange = (pairIndex: number, right: string) => {
          const newPairs = submittedPairs.map((p: any, idx: number) =>
            idx === pairIndex ? { ...p, right } : p
          );

          const updated = { selectedOptionId: null, answer: newPairs };
          setLocalAnswers((prev) => ({ ...prev, [quiz.id]: updated }));
          saveAnswerMutation.mutate({
            attemptId: attempt.id,
            quizId: quiz.id,
            answer: newPairs,
          });
        };

        return (
          <div className="mt-4 space-y-3">
            {pairs.map((pair: any, index: number) => {
              const currentRight =
                submittedPairs.find((p: any) => p.left === pair.left)?.right ||
                '';
              return (
                <div
                  key={`${pair.left}-${index}`}
                  className="grid gap-3 border-2 border-border bg-muted/10 p-3 text-sm shadow-[2px_2px_0_var(--border)] md:grid-cols-[1fr_1fr] md:items-center"
                >
                  <span className="font-bold">{pair.left}</span>
                  <select
                    value={currentRight}
                    onChange={(e) =>
                      handleMatchingChange(index, e.target.value)
                    }
                    className="border-2 border-border bg-background p-2 font-bold text-sm shadow-[2px_2px_0_var(--border)] focus:outline-none"
                  >
                    <option value="">{t('courses.quizSelectMatch')}</option>
                    {choices.map((choice: string, choiceIndex: number) => (
                      <option key={`${choice}-${choiceIndex}`} value={choice}>
                        {choice}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        );
      }

      return null;
    };

    return (
      <main className="min-h-screen bg-root-background px-5 py-5 text-foreground md:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
            {/* Sidebar with timer and navigation */}
            <aside>
              <div className="sticky top-5 space-y-4">
                <div className="border-2 border-border bg-background p-5 shadow-[4px_4px_0_var(--border)]">
                  <h3 className="font-bold text-muted-foreground text-xs uppercase tracking-wider">
                    {t('courses.timeLeft')}
                  </h3>
                  <div className="mt-1.5 font-black text-2xl text-foreground tracking-tight">
                    {timeLeft !== null ? formatTime(timeLeft) : '--:--'}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleManualSubmit}
                  disabled={submitMutation.isPending}
                  className="inline-flex w-full items-center justify-center gap-2 border-2 border-border bg-primary py-3 font-bold text-primary-foreground text-sm shadow-[3px_3px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--border)] active:translate-y-0 active:shadow-[1px_1px_0_var(--border)] disabled:opacity-50"
                >
                  {t('courses.submitTest')}
                </button>

                <div className="border-2 border-border bg-background p-5 shadow-[4px_4px_0_var(--border)]">
                  <h3 className="mb-3 font-bold text-muted-foreground text-xs uppercase tracking-wider">
                    {t('courses.testTakeQuizzes')}
                  </h3>
                  {quizzes.length === 0 ? (
                    <span className="text-muted-foreground text-xs italic">
                      {t('courses.noQuestions')}
                    </span>
                  ) : (
                    <div className="grid grid-cols-4 gap-2">
                      {quizzes.map((q: any, idx: number) => {
                        const isAnswered = Boolean(
                          localAnswers[q.id]?.selectedOptionId ||
                            localAnswers[q.id]?.answer
                        );
                        return (
                          <button
                            key={q.id}
                            type="button"
                            onClick={() => {
                              const el = document.getElementById(
                                `question-${idx}`
                              );
                              el?.scrollIntoView({ behavior: 'smooth' });
                            }}
                            className={cn(
                              'flex h-9 items-center justify-center border-2 border-border font-bold text-xs shadow-[2px_2px_0_var(--border)] transition hover:-translate-y-0.5 active:translate-y-0',
                              isAnswered
                                ? 'bg-dynamic-cyan/15 text-foreground'
                                : 'bg-muted/10 text-muted-foreground'
                            )}
                          >
                            {idx + 1}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </aside>

            {/* Test Sheet Quizzes */}
            <div className="space-y-6">
              <div className="border-2 border-border bg-background p-6 shadow-[6px_6px_0_var(--border)]">
                <h1 className="font-black text-2xl leading-tight tracking-tight">
                  {test.name}
                </h1>
                <p className="mt-1 text-muted-foreground text-sm">
                  {test.description}
                </p>
              </div>

              {quizzes.length === 0 ? (
                <div className="border-2 border-border border-dashed bg-background p-8 text-center shadow-[4px_4px_0_var(--border)]">
                  <span className="text-muted-foreground text-sm italic">
                    {t('courses.noQuestions')}
                  </span>
                </div>
              ) : (
                <div className="space-y-6">
                  {quizzes.map((quiz: any, index: number) => (
                    <div
                      key={quiz.id}
                      id={`question-${index}`}
                      className="space-y-4 border-2 border-border bg-background p-6 shadow-[4px_4px_0_var(--border)]"
                    >
                      <div className="flex items-start gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center border-2 border-border bg-primary font-black text-primary-foreground text-xs shadow-[1px_1px_0_var(--border)]">
                          {index + 1}
                        </span>
                        <h3 className="pt-0.5 font-bold text-base">
                          {quiz.question}
                        </h3>
                      </div>
                      {renderQuizInput(quiz)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    );
  }

  // Render Pre-Start View
  return (
    <main className="min-h-screen bg-root-background px-5 py-5 text-foreground md:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Back navigation link */}
        <div>
          <Link
            className="inline-flex items-center gap-2 border-2 border-border bg-background px-3 py-1.5 font-bold text-sm shadow-[3px_3px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--border)]"
            href={courseHref}
          >
            <ChevronLeft className="h-4 w-4" />
            {t('courses.backToCourse')}
          </Link>
        </div>

        {/* Page Header */}
        <div className="border-2 border-border bg-background p-6 shadow-[8px_8px_0_var(--border)] md:p-8">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div className="flex items-start gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center border-2 border-border bg-dynamic-cyan/15 shadow-[4px_4px_0_var(--border)]">
                <BookOpenCheck className="h-7 w-7" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="mb-2 inline-flex items-center gap-1.5 border-2 border-border bg-dynamic-yellow/15 px-3 py-1 font-black text-xs shadow-[3px_3px_0_var(--border)]">
                  <GraduationCap className="h-3.5 w-3.5" />
                  {courseQuery.data.name ?? t('courses.untitled')}
                </p>
                <h1 className="break-words font-black text-[clamp(1.75rem,3.5vw,3rem)] leading-none tracking-normal">
                  {test.name}
                </h1>
              </div>
            </div>

            <div className="flex shrink-0 items-center self-start md:self-center">
              <button
                onClick={() => startMutation.mutate()}
                disabled={startMutation.isPending || !hasStarted}
                className="inline-flex cursor-pointer items-center justify-center gap-2 border-2 border-border bg-primary px-5 py-3 font-bold text-base text-primary-foreground shadow-[4px_4px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0_var(--border)] active:translate-y-0 active:shadow-[2px_2px_0_var(--border)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
                type="button"
              >
                <Play className="h-5 w-5" />
                {hasStarted
                  ? t('courses.startTest')
                  : t('courses.testNotStarted')}
              </button>
            </div>
          </div>
        </div>

        {/* Metadata Details Row */}
        <div className="grid grid-cols-1 gap-4 border-2 border-border bg-background p-5 shadow-[6px_6px_0_var(--border)] md:grid-cols-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-border bg-muted/40">
              <Calendar className="h-5 w-5" />
            </span>
            <div>
              <span className="block font-black text-[10px] text-muted-foreground uppercase tracking-wider">
                {t('courses.testDetailsStartAt')}
              </span>
              <span className="font-bold text-sm">
                {test.start_at
                  ? new Date(test.start_at).toLocaleString([], {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })
                  : t('courses.notScheduled')}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-border bg-muted/40">
              <Clock className="h-5 w-5" />
            </span>
            <div>
              <span className="block font-black text-[10px] text-muted-foreground uppercase tracking-wider">
                {t('courses.testDetailsDuration')}
              </span>
              <span className="font-bold text-sm">
                {test.duration_in_minutes
                  ? t('courses.durationMinutes', {
                      minutes: test.duration_in_minutes,
                    })
                  : t('courses.untimed')}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-border bg-muted/40">
              <Layers className="h-5 w-5" />
            </span>
            <div>
              <span className="block font-black text-[10px] text-muted-foreground uppercase tracking-wider">
                {t('courses.submittingType')}
              </span>
              <span className="font-bold text-sm">
                {t('courses.onlineTest')}
              </span>
            </div>
          </div>
        </div>

        {/* Description / Instructions */}
        <div className="space-y-4 border-2 border-border bg-background p-6 shadow-[8px_8px_0_var(--border)]">
          <h2 className="border-border border-b-2 pb-2 font-black text-lg uppercase tracking-wider">
            {t('courses.assessmentOverview')}
          </h2>
          <div className="whitespace-pre-wrap text-muted-foreground text-sm leading-relaxed">
            {test.description || t('courses.noInstructions')}
          </div>
        </div>

        {/* Learning Objectives Assessed */}
        <div className="space-y-4 border-2 border-border bg-background p-6 shadow-[8px_8px_0_var(--border)]">
          <h2 className="border-border border-b-2 pb-2 font-black text-lg uppercase tracking-wider">
            {t('courses.learningObjectivesAssessed')}
          </h2>
          <p className="text-muted-foreground text-xs leading-relaxed">
            {t('courses.learningObjectivesDescription')}
          </p>
          {testModules.length === 0 ? (
            <p className="text-muted-foreground text-sm italic">
              {t('courses.noAssociatedModules')}
            </p>
          ) : (
            <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
              {testModules.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-2.5 border-2 border-border bg-muted/10 p-3 shadow-[2px_2px_0_var(--border)]"
                >
                  <span className="h-2 w-2 rounded-full bg-primary" />
                  <span className="font-bold text-sm">{m.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
