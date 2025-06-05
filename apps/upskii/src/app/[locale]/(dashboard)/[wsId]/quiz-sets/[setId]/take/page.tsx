'use client';

import QuizStatusSidebar, {
  Question,
} from '@/app/[locale]/(dashboard)/[wsId]/quiz-sets/[setId]/take/quiz-status-sidebar';
import TimeElapsedStatus from '@/app/[locale]/(dashboard)/[wsId]/quiz-sets/[setId]/take/time-elapsed-status';
import { Button } from '@tuturuuu/ui/button';
import { ListCheck } from '@tuturuuu/ui/icons';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';


// ─── TYPES ─────────────────────────────────────────────────────────────────────

type TakeResponse = {
  setId: string;
  setName: string;
  timeLimitMinutes: number | null;
  attemptLimit: number | null;
  attemptsSoFar: number;
  allowViewResults: boolean;
  questions: Question[];
};

type SubmitResult = {
  attemptId: string;
  attemptNumber: number;
  totalScore: number;
  maxPossibleScore: number;
};

// ─── COMPONENT ─────────────────────────────────────────────────────────────────

export default function TakeQuiz({
  params,
}: {
  params: {
    wsId: string;
    courseId: string;
    moduleId: string;
    setId: string;
  };
}) {
  const { wsId, courseId, moduleId, setId } = params;
  const t = useTranslations();
  const router = useRouter();

  // ─── STATE ───────────────────────────────────────────────────────────────────
  // Sidebar visibility (mobile only)
  const [sidebarVisible, setSidebarVisible] = useState(false);

  // Metadata loading / error
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [metaError, setMetaError] = useState<string | null>(null);

  // Fetched quiz metadata (including questions, time limit, attempt counts, allowViewResults)
  const [quizMeta, setQuizMeta] = useState<TakeResponse | null>(null);

  // Whether the student has clicked “Take Quiz” or resumed from localStorage
  const [hasStarted, setHasStarted] = useState(false);

  // Time state: if timeLimitMinutes != null, this is “seconds left” (countdown).
  // If timeLimitMinutes == null, this is “seconds elapsed” (count-up).
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Selected answers (quizId → selectedOptionId)
  const [selectedAnswers, setSelectedAnswers] = useState<
    Record<string, string>
  >({});

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ─── HELPERS ─────────────────────────────────────────────────────────────────

  const STORAGE_KEY = `quiz_start_${setId}`;

  // totalSeconds: if timeLimitMinutes is null → null, else minutes*60
  const totalSeconds = quizMeta?.timeLimitMinutes
    ? quizMeta.timeLimitMinutes * 60
    : null;

  // Remove stored start time when done
  const clearStartTimestamp = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  // Elapsed seconds since a given timestamp
  const computeElapsedSeconds = (startTs: number) => {
    const now = Date.now();
    return Math.floor((now - startTs) / 1000);
  };

  // Build submission payload (possibly empty array if unanswered)
  const buildSubmissionPayload = () => ({
    answers: Object.entries(selectedAnswers).map(([quizId, optionId]) => ({
      quizId,
      selectedOptionId: optionId,
    })),
  });

  // ─── FETCH METADATA ON MOUNT ─────────────────────────────────────────────────

  useEffect(() => {
    async function fetchMeta() {
      setLoadingMeta(true);
      try {
        const res = await fetch(
          `/api/v1/workspaces/${wsId}/quiz-sets/${setId}/take`
        );
        const json: TakeResponse | { error: string } = await res.json();

        if (!res.ok) {
          setMetaError(
            (json as any).error || 'Unknown error loading quiz metadata'
          );
          setLoadingMeta(false);
          return;
        }

        setQuizMeta(json as TakeResponse);

        // Check localStorage for a prior start timestamp
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored && totalSeconds !== undefined) {
          const startTs = parseInt(stored, 10);
          if (!isNaN(startTs)) {
            if (totalSeconds !== null) {
              // countdown scenario
              const elapsed = computeElapsedSeconds(startTs);
              if (elapsed >= totalSeconds) {
                // expired already → auto‐submit
                setHasStarted(true);
                setTimeLeft(0);
              } else {
                setHasStarted(true);
                setTimeLeft(totalSeconds - elapsed);
              }
            } else {
              // no‐limit scenario → count up from elapsed
              const elapsed = computeElapsedSeconds(startTs);
              setHasStarted(true);
              setTimeLeft(elapsed);
            }
          }
        }
      } catch {
        setMetaError('Network error loading quiz metadata');
      } finally {
        setLoadingMeta(false);
      }
    }

    fetchMeta();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // Note: totalSeconds is derived from quizMeta, so on first mount it's undefined; we only want this effect once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setId]);

  // ─── START/RESUME TIMER ONCE `hasStarted` CHANGES ─────────────────────────────

  useEffect(() => {
    if (!hasStarted || quizMeta === null) return;

    // If countdown ended immediately (timeLeft===0), do auto‐submit:
    if (totalSeconds !== null && timeLeft === 0) {
      handleSubmit(true);
      return;
    }

    // Clear any previous interval
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    // If there is a countdown (totalSeconds != null), decrement timeLeft.
    if (totalSeconds !== null) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev === null) return null;
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      // No time limit: run a count‐up timer (increment timeLeft each second)
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => (prev === null ? 1 : prev + 1));
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [hasStarted, quizMeta]);

  // ─── AUTO‐SUBMIT ON TIMEOUT ───────────────────────────────────────────────────

  useEffect(() => {
    // Only relevant if it's a countdown
    if (hasStarted && totalSeconds !== null && timeLeft === 0) {
      handleSubmit(true);
    }
  }, [timeLeft, hasStarted, totalSeconds]);

  // ─── HANDLE “TAKE QUIZ” BUTTON CLICK ──────────────────────────────────────────

  const onClickStart = () => {
    if (!quizMeta) return;

    if (totalSeconds !== null) {
      // Countdown case: save start timestamp
      const now = Date.now();
      try {
        localStorage.setItem(STORAGE_KEY, now.toString());
      } catch {
        // ignore
      }
      setHasStarted(true);
      setTimeLeft(totalSeconds);
    } else {
      // No time limit: count from zero
      const now = Date.now();
      try {
        localStorage.setItem(STORAGE_KEY, now.toString());
      } catch {
        // ignore
      }
      setHasStarted(true);
      setTimeLeft(0);
    }
  };

  // ─── HANDLE SUBMISSION ────────────────────────────────────────────────────────

  const handleSubmit = async (_auto: boolean = false) => {
    if (!quizMeta) return;

    // // If not auto‐submit, require all questions answered
    // if (!auto) {
    //   const unanswered = quizMeta.questions.filter(
    //     (q) => !selectedAnswers[q.quizId]
    //   );
    //   if (unanswered.length > 0) {
    //     alert(
    //       t('ws-quizzes.please_answer_all') || 'Please answer all questions.'
    //     );
    //     return;
    //   }
    // }

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
        setSubmitting(false);
        return;
      }

      // Success: clear timer, localStorage, and show results
      clearStartTimestamp();
      setSubmitResult(json as SubmitResult);
      setSubmitting(false);
    } catch {
      setSubmitError('Network error submitting.');
      setSubmitting(false);
    }
  };

  // ─── RENDER LOGIC ─────────────────────────────────────────────────────────────

  // 1) Loading or metadata error
  if (loadingMeta) {
    return (
      <p className="p-4">{t('ws-quizzes.loading') || 'Loading quiz...'}</p>
    );
  }
  if (metaError) {
    return <p className="p-4 text-red-600">{metaError}</p>;
  }
  if (!quizMeta) {
    return null;
  }

  const { setName, attemptLimit, attemptsSoFar, allowViewResults, questions } =
    quizMeta;

  // 2) If the student has already submitted, show results screen
  if (submitResult) {
    return (
      <div className="mx-auto max-w-md space-y-4 p-4">
        <h2 className="text-2xl font-bold">
          {t('ws-quizzes.results') || 'Results'}
        </h2>
        <p>
          {t('ws-quizzes.attempt')} #{submitResult.attemptNumber}{' '}
          {t('ws-quizzes.of')} {attemptLimit ?? t('ws-quizzes.unlimited')}
        </p>
        <p>
          {t('ws-quizzes.score')}: {submitResult.totalScore} /{' '}
          {submitResult.maxPossibleScore}
        </p>
        <Button
          className="mt-2 bg-blue-600 text-white hover:bg-blue-700"
          onClick={() => {
            // Navigate back to the quiz‐set overview:
            router.push(
              `/dashboard/${wsId}/courses/${courseId}/modules/${moduleId}/quizzes`
            );
          }}
        >
          {t('ws-quizzes.done') || 'Done'}
        </Button>
      </div>
    );
  }

  // 3) If the student has NOT started yet…
  if (!hasStarted) {
    // If attempt limit is reached, show “View Results” (if allowed) or “No attempts left”
    if (attemptLimit !== null && attemptsSoFar >= attemptLimit) {
      return (
        <div className="mx-auto flex max-w-lg flex-col items-center space-y-4 p-6">
          <h1 className="text-3xl font-bold">{setName}</h1>
          <p className="text-lg">
            {t('ws-quizzes.attempts') || 'Attempts'}: {attemptsSoFar} /{' '}
            {attemptLimit}
          </p>
          {allowViewResults ? (
            <Button
              className="bg-green-600 text-white hover:bg-green-700"
              onClick={() => {
                router.push(
                  `/dashboard/${wsId}/courses/${courseId}/modules/${moduleId}/quizzes/${setId}/results`
                );
              }}
            >
              {t('ws-quizzes.view_results') || 'View Results'}
            </Button>
          ) : (
            <p className="text-red-600">
              {t('ws-quizzes.no_attempts_left') || 'You have no attempts left.'}
            </p>
          )}
        </div>
      );
    }

    // Otherwise, show “Take Quiz” button + attempt/time-limit info
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center space-y-4 p-6">
        <h1 className="text-3xl font-bold">{setName}</h1>

        {attemptLimit !== null ? (
          <p className="text-lg">
            {t('ws-quizzes.attempts') || 'Attempts'}: {attemptsSoFar} /{' '}
            {attemptLimit}
          </p>
        ) : (
          <p className="text-lg">
            {t('ws-quizzes.attempts') || 'Attempts'}: {attemptsSoFar} /{' '}
            {t('ws-quizzes.unlimited')}
          </p>
        )}

        {quizMeta.timeLimitMinutes !== null ? (
          <p className="text-base">
            {t('ws-quizzes.time_limit') || 'Time Limit'}:{' '}
            {quizMeta.timeLimitMinutes} {t('ws-quizzes.minutes') || 'minutes'}
          </p>
        ) : (
          <p className="text-base">
            {t('ws-quizzes.no_time_limit') || 'No time limit'}
          </p>
        )}

        <Button
          className="bg-dynamic-purple/20 border border-dynamic-purple text-white hover:bg-dynamic-purple/40"
          onClick={onClickStart}
        >
          {t('ws-quizzes.take_quiz') || 'Take Quiz'}
        </Button>
      </div>
    );
  }

  // 4) Once hasStarted = true, show timer, sidebar, and question form

  const isCountdown = totalSeconds !== null;

  return (
    <div className="mx-auto flex max-w-6xl flex-col p-0 lg:flex-row lg:gap-6 lg:p-6">
      {/* ── STICKY HEADER ON MOBILE ───────────────────────────────── */}
      <div className="bg-card/90 backdrop-blur-xs sticky top-0 z-10 mb-2 space-y-2 shadow rounded-md lg:hidden">
        <div className="flex gap-2">
          <button
            className="group"
            onClick={() => setSidebarVisible((prev) => !prev)}
          >
            <ListCheck
              className="text-dynamic-purple group-hover:text-dynamic-purple/70 transition-colors duration-200"
              size={32}
            />
          </button>
          <TimeElapsedStatus
            timeLeft={timeLeft}
            isCountdown={isCountdown}
            t={t}
          />
        </div>
        <div className="absolute left-0 right-0 top-16">
          {sidebarVisible && (
            <QuizStatusSidebar
              questions={questions}
              selectedAnswers={selectedAnswers}
              t={t}
            />
          )}
        </div>
      </div>
      {/* ── MAIN CONTENT: Timer + Questions Form ───────────────────────────────── */}
      <main className="order-2 w-full grow space-y-4 p-0.5 md:p-2 lg:order-1 lg:w-3/4 lg:p-0">
        <h1 className="text-3xl font-bold">{setName}</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit(false);
          }}
          className="space-y-8"
        >
          {questions.map((q, idx) => (
            <div key={q.quizId} id={`question-${idx}`} className="space-y-2">
              <div>
                <span className="font-semibold">
                  {idx + 1}. {q.question}{' '}
                  <span className="text-sm text-gray-500">
                    ({t('ws-quizzes.points') || 'Points'}: {q.score})
                  </span>
                </span>
              </div>
              <div className="space-y-1">
                {q.options.map((opt) => (
                  <label
                    key={opt.id}
                    className="flex cursor-pointer items-center space-x-2"
                  >
                    <input
                      type="radio"
                      name={`quiz-${q.quizId}`}
                      value={opt.id}
                      checked={selectedAnswers[q.quizId] === opt.id}
                      onChange={() =>
                        setSelectedAnswers((prev) => ({
                          ...prev,
                          [q.quizId]: opt.id,
                        }))
                      }
                      disabled={submitting || (isCountdown && timeLeft === 0)}
                      className="form-radio"
                    />
                    <span>{opt.value}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}

          {submitError && <p className="text-red-600">{submitError}</p>}

          <div className="mt-4">
            <Button
              type="submit"
              disabled={submitting || (isCountdown && timeLeft === 0)}
              className={`rounded px-6 py-5 md:py-4 lg:py-2 text-white w-full lg:w-fit ${
                submitting || (isCountdown && timeLeft === 0)
                  ? 'cursor-not-allowed bg-gray-400'
                  : 'bg-dynamic-purple/20 hover:bg-dynamic-purple/40 border-dynamic-purple border'
              }`}
            >
              {submitting
                ? t('ws-quizzes.submitting') || 'Submitting...'
                : t('ws-quizzes.submit') || 'Submit'}
            </Button>
          </div>
        </form>
      </main>

      <aside className="relative order-1 hidden w-full lg:order-2 lg:block lg:w-5/12">
        {/* For Desktop */}
        <div className="sticky top-4 space-y-2">
          {/* ── MAIN CONTENT: Timer ───────────────────────────────── */}
          <TimeElapsedStatus
            timeLeft={timeLeft}
            isCountdown={isCountdown}
            t={t}
          />
          {/* ── SIDEBAR: Question Status ─────────────────────────────────────────────── */}
          <QuizStatusSidebar
            questions={questions}
            selectedAnswers={selectedAnswers}
            t={t}
          />
        </div>
      </aside>
    </div>
  );
}
