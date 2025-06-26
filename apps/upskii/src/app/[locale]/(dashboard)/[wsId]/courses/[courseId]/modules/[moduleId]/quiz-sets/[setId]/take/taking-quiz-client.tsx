'use client';

import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { ListCheck, TriangleAlert } from '@tuturuuu/ui/icons';
import { Label } from '@tuturuuu/ui/label';
import { RadioGroup, RadioGroupItem } from '@tuturuuu/ui/radio-group';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import BeforeTakingQuizWhole from '@/app/[locale]/(dashboard)/[wsId]/courses/[courseId]/modules/[moduleId]/quiz-sets/[setId]/take/before-taking-quiz-whole';
import QuizStatusSidebar from '@/app/[locale]/(dashboard)/[wsId]/courses/[courseId]/modules/[moduleId]/quiz-sets/[setId]/take/quiz-status-sidebar';
import TimeElapsedStatus from '@/app/[locale]/(dashboard)/[wsId]/courses/[courseId]/modules/[moduleId]/quiz-sets/[setId]/take/time-elapsed-status';






  



















type ErrorResponse = { error: string };

type SubmitResult = {
  attemptId: string;
  attemptNumber: number;
  totalScore: number;
  maxPossibleScore: number;
};



type ErrorResponse = { error: string };

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
  const t = useTranslations('ws-quizzes');
  const _router = useRouter();

  // ─── STATE ────────────────────────────────────────────────────────────────
  const [_sidebarVisible, _setSidebarVisible] = useState(false);

  const [_loadingMeta, setLoadingMeta] = useState(true);
  const [_metaError, setMetaError] = useState<string | null>(null);
  const [quizMeta, setQuizMeta] = useState<TakeResponse | null>(null);

  const [hasStarted, setHasStarted] = useState(false);
  const [_isPastDue, setIsPastDue] = useState(false);
  const [_isAvailable, setIsAvailable] = useState(true);

  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  // eslint-disable-next-line no-undef
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Now can be string (radio) or string[] (checkbox)
  const [selectedAnswers, setSelectedAnswers] = useState<
    Record<string, string | string[]>
  >({});

  const [_submitting, _setSubmitting] = useState(false);
  const [_submitError, _setSubmitError] = useState<string | null>(null);

  // ─── HELPERS ────────────────────────────────────────────────────────────────
  const STORAGE_KEY = `quiz_start_${setId}`;
  const ANSWERS_KEY = `quiz_answers_${setId}`;
  const totalSeconds = quizMeta?.timeLimitMinutes
    ? quizMeta.timeLimitMinutes * 60
    : null;

  const _clearStartTimestamp = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
  };

  const computeElapsedSeconds = (startTs: number) =>
    Math.floor((Date.now() - startTs) / 1000);

  const _buildSubmissionPayload = () => ({
    answers: Object.entries(selectedAnswers).flatMap(([quizId, val]) => {
      if (Array.isArray(val)) {
        return val.map((v) => ({ quizId, selectedOptionId: v }));
      }
      return { quizId, selectedOptionId: val };
    }),
    durationSeconds: computeElapsedSeconds(
      Number(localStorage.getItem(STORAGE_KEY))
    ),
  });

  // Only for debugging purposes
  // useEffect(() => {
  //   localStorage.removeItem(ANSWERS_KEY);
  //   localStorage.removeItem(STORAGE_KEY);
  //   clearStartTimestamp();
  // }, [setId]);

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
          setMetaError((json as ErrorResponse).error || t('errors.unknown-error'));
          return setLoadingMeta(false);
        }

        setQuizMeta(json as TakeResponse);

        // restore answers
        const saved = localStorage.getItem(ANSWERS_KEY);
        if (saved) {
          try {
            setSelectedAnswers(JSON.parse(saved));
          } catch {
            // Ignore JSON parse errors
          }
        }
        // due date
        if ('dueDate' in json && json.dueDate) {
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
          if (!Number.isNaN(startTs)) {
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
        setMetaError(t('errors.network-error'));
      } finally {
        setLoadingMeta(false);
      }
    }
    fetchMeta();
    return () => {
      timerRef.current && clearInterval(timerRef.current);
    };
  }, [
    setId,
    ANSWERS_KEY,
    STORAGE_KEY,
    computeElapsedSeconds,
    t,
    totalSeconds,
    wsId,
  ]);

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
              ? {
{
if (timerRef._current) {
clearInterval(timerRef.current);
}
return 0;
}
}
              : prev - 1
        );
      }, 1000);
    } else {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => (prev === null ? 1 : prev + 1));
      }, 1000);
    }
    return () => void clearInterval(timerRef.current!);
  }, [hasStarted, quizMeta, handleSubmit, timeLeft, totalSeconds]);

  useEffect(() => {
    if (hasStarted && totalSeconds != null && timeLeft === 0) {
      handleSubmit();
    }
  }, [timeLeft, hasStarted, totalSeconds, handleSubmit]);
  useEffect(() => {
    if (submitError) {
      toast(t('errors.error-type-submit'), {
        description: submitError,
        action: {
          label: 'X',
          onClick: () => console.log('Close'),
        },
      });
    }
  }, [submitError, t]);

  // ─── EVENT HANDLERS ─────────────────────────────────────────────────────────
  const onClickStart = () => {
    if (!quizMeta) return;
    const nowMs = Date.now();
    try {
      localStorage.setItem(STORAGE_KEY, nowMs.toString());
    } catch {
      // Ignore localStorage errors
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
        setSubmitError((json as ErrorResponse).error || t('errors.submission-failed'));
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
      setSubmitError(t('errors.network-error-submitting'));
    } finally {
      setSubmitting(false);
    }
  }

  // ─── RENDER ─────────────────────────────────────────────────────────────────
  if (loadingMeta) return <LoadingIndicator className="mx-auto mt-8" />;
  if (metaError)
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3">
        <TriangleAlert size={48} className="text-red-500" />
        <p className="text-red-500">{metaError}</p>
      </div>
    );
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
          <TimeElapsedStatus timeLeft={timeLeft} isCountdown={isCountdown} />
        </div>
        {sidebarVisible && quizMeta && (
          <QuizStatusSidebar
            questions={quizMeta.questions}
            selectedAnswers={selectedAnswers}
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
                      ({t('points')}: {q.score})
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
                          className="h-5.5 w-5.5 border-dynamic-purple/80 bg-dynamic-purple/20"
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
                            } catch {
                              // Ignore localStorage errors
                            }
                          }}
                        />
                        <Label
                          htmlFor={`${q.quizId}-${opt.id}`}
                          className="leading-5.5"
                        >
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
                        } catch {
                          // Ignore localStorage errors
                        }
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
                            className="h-5.5 w-5.5 border-dynamic-purple/80 bg-dynamic-purple/20"
                          />
                          <Label
                            htmlFor={`${q.quizId}-${opt.id}`}
                            className="leading-5.5"
                          >
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

          <div className="mt-4 mb-20">
            <Button
              type="submit"
              disabled={submitting || (isCountdown && timeLeft === 0)}
              className={`box-border h-auto w-full rounded px-6 py-2 text-primary ${
                submitting || (isCountdown && timeLeft === 0)
                  ? 'cursor-not-allowed bg-gray-400'
                  : 'border border-dynamic-purple bg-dynamic-purple/20 hover:bg-dynamic-purple/40'
              }`}
            >
              {submitting
                ? t('submitting') || 'Submitting...'
                : t('submit') || 'Submit'}
            </Button>
          </div>
        </form>
      </main>

      <aside className="order-1 hidden w-full lg:order-2 lg:block lg:w-5/12">
        <div className="sticky top-4 space-y-2">
          <TimeElapsedStatus timeLeft={timeLeft} isCountdown={isCountdown} />
          <QuizStatusSidebar
            questions={quizMeta.questions}
            selectedAnswers={selectedAnswers}
          />
        </div>
      </aside>
    </div>
  );
}
