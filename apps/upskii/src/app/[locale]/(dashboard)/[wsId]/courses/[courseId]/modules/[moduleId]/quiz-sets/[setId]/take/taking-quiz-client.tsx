'use client';


import BeforeTakingQuizWhole, { AttemptSummary } from '@/app/[locale]/(dashboard)/[wsId]/courses/[courseId]/modules/[moduleId]/quiz-sets/[setId]/take/before-taking-quiz-whole';
import QuizStatusSidebar from '@/app/[locale]/(dashboard)/[wsId]/courses/[courseId]/modules/[moduleId]/quiz-sets/[setId]/take/quiz-status-sidebar';
import TimeElapsedStatus from '@/app/[locale]/(dashboard)/[wsId]/courses/[courseId]/modules/[moduleId]/quiz-sets/[setId]/take/time-elapsed-status';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { ListCheck } from '@tuturuuu/ui/icons';
import { Label } from '@tuturuuu/ui/label';
import { RadioGroup, RadioGroupItem } from '@tuturuuu/ui/radio-group';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

type TakeResponse = {
  setId: string;
  setName: string;
  timeLimitMinutes: number | null;
  releasePointsImmediately: boolean;
  attemptLimit: number | null;
  attemptsSoFar: number;
  allowViewOldAttempts: boolean;
  availableDate: string | null;
  dueDate: string | null;
  resultsReleased: boolean;
  attempts: AttemptSummary[];
  explanationMode: 0 | 1 | 2;
  instruction: any;
  questions: Array<{
    quizId: string;
    question: string;
    score: number;
    multiple: boolean;
    options: { id: string; value: string }[];
  }>;
};

type SubmitResult = {
  attemptId: string;
  attemptNumber: number;
  totalScore: number;
  maxPossibleScore: number;
};

export default function TakingQuizClient({
  wsId,
  courseId,
  moduleId,
  setId,
}: {
  wsId: string;
  courseId: string;
  moduleId: string;
  setId: string;
}) {
  const t = useTranslations();
  const router = useRouter();

  // ─── STATE ────────────────────────────────────────────────────────────────
  const [sidebarVisible, setSidebarVisible] = useState(false);

  const [loadingMeta, setLoadingMeta] = useState(true);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [quizMeta, setQuizMeta] = useState<TakeResponse | null>(null);

  const [hasStarted, setHasStarted] = useState(false);
  const [isPastDue, setIsPastDue] = useState(false);
  const [isAvailable, setIsAvailable] = useState(true);
  const [dueDateStr, setDueDateStr] = useState<string | null>(null);

  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Now can be string (radio) or string[] (checkbox)
  const [selectedAnswers, setSelectedAnswers] = useState<
    Record<string, string | string[]>
  >({});

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ─── HELPERS ────────────────────────────────────────────────────────────────
  const STORAGE_KEY = `quiz_start_${setId}`;
  const ANSWERS_KEY = `quiz_answers_${setId}`;
  const totalSeconds = quizMeta?.timeLimitMinutes
    ? quizMeta.timeLimitMinutes * 60
    : null;

  const clearStartTimestamp = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  };

  const computeElapsedSeconds = (startTs: number) =>
    Math.floor((Date.now() - startTs) / 1000);

  const buildSubmissionPayload = () => ({
    answers: Object.entries(selectedAnswers)
      .map(([quizId, val]) => {
        if (Array.isArray(val)) {
          return val.map((v) => ({ quizId, selectedOptionId: v }));
        }
        return { quizId, selectedOptionId: val };
      })
      .flat(),
  });

  useEffect(() => {
    localStorage.removeItem(ANSWERS_KEY);
    localStorage.removeItem(STORAGE_KEY);
    clearStartTimestamp();
  }, [setId]);

  // ─── FETCH METADATA ─────────────────────────────────────────────────────────
  useEffect(() => {
    async function fetchMeta() {
      setLoadingMeta(true);
      try {
        const res = await fetch(
          `/api/v1/workspaces/${wsId}/quiz-sets/${setId}/take`
        );
        const json: TakeResponse | { error: string } = await res.json();

        if (!res.ok) {
          setMetaError((json as any).error || 'Unknown error');
          return setLoadingMeta(false);
        }

        setQuizMeta(json as TakeResponse);

        // restore answers
        const saved = localStorage.getItem(ANSWERS_KEY);
        if (saved) {
          try {
            setSelectedAnswers(JSON.parse(saved));
          } catch {}
        }
        // due date
        if ('dueDate' in json && json.dueDate) {
          setDueDateStr(json.dueDate);
          if (new Date(json.dueDate) < new Date()) {
            setIsPastDue(true);
          }
        }

        // available date
        if ('availableDate' in json && json.availableDate) {
          setIsAvailable(new Date(json.availableDate) <= new Date());
        }

        // resume timer
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const startTs = parseInt(stored, 10);
          if (!isNaN(startTs)) {
            setHasStarted(true);
            if (totalSeconds != null) {
              const elapsed = computeElapsedSeconds(startTs);
              setTimeLeft(elapsed >= totalSeconds ? 0 : totalSeconds - elapsed);
            } else {
              setTimeLeft(computeElapsedSeconds(startTs));
            }
          }
        }
      } catch {
        setMetaError('Network error');
      } finally {
        setLoadingMeta(false);
      }
    }
    fetchMeta();
    return () => {
      timerRef.current && clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setId]);

  // ─── TIMER LOGIC ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!hasStarted || !quizMeta) return;
    if (totalSeconds != null && timeLeft === 0) {
      handleSubmit();
      return;
    }
    timerRef.current && clearInterval(timerRef.current);
    if (totalSeconds != null) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) =>
          prev === null
            ? null
            : prev <= 1
              ? (clearInterval(timerRef.current!), 0)
              : prev - 1
        );
      }, 1000);
    } else {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => (prev === null ? 1 : prev + 1));
      }, 1000);
    }
    return () => void clearInterval(timerRef.current!);
  }, [hasStarted, quizMeta]);

  useEffect(() => {
    if (hasStarted && totalSeconds != null && timeLeft === 0) {
      handleSubmit();
    }
  }, [timeLeft, hasStarted, totalSeconds]);

  // ─── EVENT HANDLERS ─────────────────────────────────────────────────────────
  const onClickStart = () => {
    if (!quizMeta) return;
    const nowMs = Date.now();
    try {
      localStorage.setItem(STORAGE_KEY, nowMs.toString());
    } catch {
      console.warn('Failed to save start timestamp to localStorage');
      // Fallback: use session storage
    }
    setHasStarted(true);
    setTimeLeft(totalSeconds ?? 0);
  };

  async function handleSubmit() {
    if (!quizMeta) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/quiz-sets/${setId}/submit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildSubmissionPayload()),
        }
      );
      const json: SubmitResult | { error: string } = await res.json();

      if (!res.ok) {
        setSubmitError((json as any).error || 'Submission failed.');
        return setSubmitting(false);
      }

      localStorage.removeItem(ANSWERS_KEY);
      localStorage.removeItem(STORAGE_KEY);
      clearStartTimestamp();
      if ('attemptId' in json) {
        router.push(
          `/${wsId}/courses/${courseId}/modules/${moduleId}/quiz-sets/${setId}/result?attemptId=${json.attemptId}`
        );
      }
      // setSubmitResult(json as SubmitResult);
    } catch {
      setSubmitError('Network error submitting.');
    } finally {
      setSubmitting(false);
    }
  }

  // ─── RENDER ─────────────────────────────────────────────────────────────────
  if (loadingMeta) return <LoadingIndicator className="mx-auto mt-8" />;
  if (metaError) return <p className="p-4 text-red-600">{metaError}</p>;
  if (!quizMeta) return null;

  // Take Quiz button + instruction
  if (!hasStarted) {
    return (
      <BeforeTakingQuizWhole
        quizData={quizMeta}
        isPastDue={isPastDue}
        isAvailable={isAvailable}
        onStart={onClickStart}
        wsId={wsId}
        courseId={courseId}
        moduleId={moduleId}
        setId={setId}
      />
    );
  }

  // Quiz form
  const isCountdown = totalSeconds != null;

  return (
    <div className="mx-auto flex max-w-6xl flex-col p-0 lg:flex-row lg:gap-6 lg:p-6">
      {/* Mobile header */}
      <div className="sticky top-0 mb-2 space-y-2 rounded-md bg-card/90 shadow lg:hidden">
        <div className="flex gap-2 p-2">
          <button onClick={() => setSidebarVisible(!sidebarVisible)}>
            <ListCheck size={32} className="text-dynamic-purple" />
          </button>
          <TimeElapsedStatus
            timeLeft={timeLeft}
            isCountdown={isCountdown}
            t={t}
          />
        </div>
        {sidebarVisible && quizMeta && (
          <QuizStatusSidebar
            questions={quizMeta.questions}
            selectedAnswers={selectedAnswers}
            t={t}
          />
        )}
      </div>

      <main className="order-2 w-full grow space-y-4 p-2 lg:order-1 lg:w-3/4 lg:p-0">
        <h1 className="text-3xl font-bold">{quizMeta.setName}</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="space-y-8"
        >
          {quizMeta.questions.map((q, idx) => {
            const sel = selectedAnswers[q.quizId];
            const selArray = q.multiple ? (Array.isArray(sel) ? sel : []) : [];

            return (
              <Card key={q.quizId} className="shadow-sm" id={`quiz-${idx}`}>
                <CardHeader>
                  <CardTitle>
                    {idx + 1}. {q.question}{' '}
                    <span className="text-sm text-muted-foreground">
                      ({t('ws-quizzes.points')}: {q.score})
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {q.multiple ? (
                    // Multiple‐choice
                    q.options.map((opt) => (
                      <div key={opt.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`${q.quizId}-${opt.id}`}
                          checked={selArray.includes(opt.id)}
                          onCheckedChange={(checked) => {
                            let nextArr = selArray.slice();
                            if (checked) {
                              nextArr.push(opt.id);
                            } else {
                              nextArr = nextArr.filter((x) => x !== opt.id);
                            }
                            const nextState = {
                              ...selectedAnswers,
                              [q.quizId]: nextArr,
                            };
                            setSelectedAnswers(nextState);
                            try {
                              localStorage.setItem(
                                ANSWERS_KEY,
                                JSON.stringify(nextState)
                              );
                            } catch {}
                          }}
                        />
                        <Label htmlFor={`${q.quizId}-${opt.id}`}>
                          {opt.value}
                        </Label>
                      </div>
                    ))
                  ) : (
                    // Single‐choice
                    <RadioGroup
                      name={`quiz-${q.quizId}`}
                      value={(sel as string) ?? ''}
                      onValueChange={(value) => {
                        const next = { ...selectedAnswers, [q.quizId]: value };
                        setSelectedAnswers(next);
                        try {
                          localStorage.setItem(
                            ANSWERS_KEY,
                            JSON.stringify(next)
                          );
                        } catch {}
                      }}
                      className="space-y-2"
                    >
                      {q.options.map((opt) => (
                        <div
                          key={opt.id}
                          className="flex items-center space-x-2"
                        >
                          <RadioGroupItem
                            value={opt.id}
                            id={`${q.quizId}-${opt.id}`}
                            disabled={
                              submitting || (isCountdown && timeLeft === 0)
                            }
                          />
                          <Label htmlFor={`${q.quizId}-${opt.id}`}>
                            {opt.value}
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {submitError && <p className="text-red-600">{submitError}</p>}

          <div className="mt-4">
            <Button
              type="submit"
              disabled={submitting || (isCountdown && timeLeft === 0)}
              className={`w-full rounded px-6 py-5 text-primary md:py-4 lg:w-fit lg:py-2 ${
                submitting || (isCountdown && timeLeft === 0)
                  ? 'cursor-not-allowed bg-gray-400'
                  : 'border border-dynamic-purple bg-dynamic-purple/20 hover:bg-dynamic-purple/40'
              }`}
            >
              {submitting
                ? t('ws-quizzes.submitting') || 'Submitting...'
                : t('ws-quizzes.submit') || 'Submit'}
            </Button>
          </div>
        </form>
      </main>

      <aside className="order-1 hidden w-full lg:order-2 lg:block lg:w-5/12">
        <div className="sticky top-4 space-y-2">
          <TimeElapsedStatus
            timeLeft={timeLeft}
            isCountdown={isCountdown}
            t={t}
          />
          <QuizStatusSidebar
            questions={quizMeta.questions}
            selectedAnswers={selectedAnswers}
            t={t}
          />
        </div>
      </aside>
    </div>
  );
}
