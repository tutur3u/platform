'use client';

import BeforeTakeQuizSection from '@/app/[locale]/(dashboard)/[wsId]/quiz-sets/[setId]/take/before-take-quiz-section';
import PastDueSection from '@/app/[locale]/(dashboard)/[wsId]/quiz-sets/[setId]/take/past-due-section';
import QuizStatusSidebar, {
  Question,
} from '@/app/[locale]/(dashboard)/[wsId]/quiz-sets/[setId]/take/quiz-status-sidebar';
import ShowResultSummarySection from '@/app/[locale]/(dashboard)/[wsId]/quiz-sets/[setId]/take/show-result-summary-section';
import TimeElapsedStatus from '@/app/[locale]/(dashboard)/[wsId]/quiz-sets/[setId]/take/time-elapsed-status';
import { Button } from '@tuturuuu/ui/button';
import { ListCheck } from '@tuturuuu/ui/icons';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { use, useEffect, useRef, useState } from 'react';

// File: app/(dashboard)/[wsId]/courses/[courseId]/modules/[moduleId]/quizzes/[setId]/take/page.tsx

// File: app/(dashboard)/[wsId]/courses/[courseId]/modules/[moduleId]/quizzes/[setId]/take/page.tsx

type TakeResponse = {
  setId: string;
  setName: string;
  timeLimitMinutes: number | null;
  attemptLimit: number | null;
  attemptsSoFar: number;
  allowViewResults: boolean;
  questions: Question[];
  dueDate: string | null;
};

type SubmitResult = {
  attemptId: string;
  attemptNumber: number;
  totalScore: number;
  maxPossibleScore: number;
};

export default function TakeQuiz({
  params,
}: {
  params: Promise<{
    wsId: string;
    courseId: string;
    moduleId: string;
    setId: string;
  }>;
}) {
  const { wsId, courseId, moduleId, setId } = use(params);
  const t = useTranslations();
  const router = useRouter();

  // ─── STATE ───────────────────────────────────────────────────────────────────
  const [sidebarVisible, setSidebarVisible] = useState(false);

  const [loadingMeta, setLoadingMeta] = useState(true);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [quizMeta, setQuizMeta] = useState<TakeResponse | null>(null);

  const [hasStarted, setHasStarted] = useState(false);
  const [isPastDue, setIsPastDue] = useState(false);
  const [dueDateStr, setDueDateStr] = useState<string | null>(null);

  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [selectedAnswers, setSelectedAnswers] = useState<
    Record<string, string>
  >({});

  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ─── HELPERS ─────────────────────────────────────────────────────────────────
  const STORAGE_KEY = `quiz_start_${setId}`;
  const totalSeconds = quizMeta?.timeLimitMinutes
    ? quizMeta.timeLimitMinutes * 60
    : null;

  const clearStartTimestamp = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.error(e);
    }
  };

  const computeElapsedSeconds = (startTs: number) =>
    Math.floor((Date.now() - startTs) / 1000);

  const buildSubmissionPayload = () => ({
    answers: Object.entries(selectedAnswers).map(([quizId, optionId]) => ({
      quizId,
      selectedOptionId: optionId,
    })),
  });

  // ─── FETCH METADATA ────────────────────────────────────────────────────────────
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
          setLoadingMeta(false);
          return;
        }

        setQuizMeta(json as TakeResponse);
        if ('dueDate' in json && json.dueDate) {
          setDueDateStr(json.dueDate);
          if (new Date(json.dueDate) < new Date()) {
            setIsPastDue(true);
          }
        }

        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const startTs = parseInt(stored, 10);
          if (!isNaN(startTs)) {
            if (totalSeconds !== null) {
              const elapsed = computeElapsedSeconds(startTs);
              setHasStarted(true);
              setTimeLeft(elapsed >= totalSeconds ? 0 : totalSeconds - elapsed);
            } else {
              setHasStarted(true);
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
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [setId, totalSeconds]);

  // ─── TIMER LOGIC ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!hasStarted || !quizMeta) return;

    if (totalSeconds !== null && timeLeft === 0) {
      handleSubmit();
      return;
    }

    timerRef.current && clearInterval(timerRef.current);

    if (totalSeconds !== null) {
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
    if (hasStarted && totalSeconds !== null && timeLeft === 0) {
      handleSubmit();
    }
  }, [timeLeft, hasStarted, totalSeconds]);

  // ─── EVENT HANDLERS ─────────────────────────────────────────────────────────
  const onClickStart = () => {
    if (!quizMeta) return;
    const nowMs = Date.now();
    try {
      localStorage.setItem(STORAGE_KEY, nowMs.toString());
    } catch (e) {
      console.error(e);
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

      clearStartTimestamp();
      setSubmitResult(json as SubmitResult);
    } catch {
      setSubmitError('Network error submitting.');
    } finally {
      setSubmitting(false);
    }
  }

  // ─── RENDER ───────────────────────────────────────────────────────────────────
  if (loadingMeta) {
    return <p className="p-4">{t('ws-quizzes.loading') || 'Loading...'}</p>;
  }
  if (metaError) {
    return <p className="p-4 text-red-600">{metaError}</p>;
  }
  if (!quizMeta) {
    return null;
  }

  // Past due?
  if (isPastDue) {
    return (
      <PastDueSection
        t={t}
        quizMeta={quizMeta}
        dueDateStr={dueDateStr}
        wsId={wsId}
        courseId={courseId}
        moduleId={moduleId}
        setId={setId}
        router={router}
      />
    );
  }

  // After submit: show result summary
  if (submitResult) {
    return (
      <ShowResultSummarySection
        t={t}
        submitResult={submitResult}
        quizMeta={{
          attemptLimit: quizMeta.attemptLimit,
          setName: quizMeta.setName,
          attemptsSoFar: quizMeta.attemptsSoFar,
          timeLimitMinutes: quizMeta.timeLimitMinutes,
        }}
        wsId={wsId}
        courseId={courseId}
        moduleId={moduleId}
        router={router}
      />
    );
  }

  // ─── NEW: Immediate‐release case ─────────────────────────────────────────────
  if (!hasStarted && quizMeta.allowViewResults && quizMeta.attemptsSoFar > 0) {
    return (
      <div className="mx-auto max-w-lg p-6 text-center">
        <h1 className="text-3xl font-bold">{quizMeta.setName}</h1>
        <p className="mt-4 text-lg">
          {t('ws-quizzes.results_available') ||
            'Your previous attempt(s) have been scored.'}
        </p>
        <Button
          className="mt-6 bg-green-600 text-white hover:bg-green-700"
          onClick={() =>
            router.push(
              `/dashboard/${wsId}/courses/${courseId}/modules/${moduleId}/quizzes/${setId}/results`
            )
          }
        >
          {t('ws-quizzes.view_results') || 'View Results'}
        </Button>
        {dueDateStr && (
          <p className="mt-2 text-sm text-gray-500">
            {t('ws-quizzes.due_on') || 'Due on'}:{' '}
            {new Date(dueDateStr).toLocaleString()}
          </p>
        )}
      </div>
    );
  }

  // ─── “Not started yet”: no attempts left? ────────────────────────────────────
  if (
    !hasStarted &&
    quizMeta.attemptLimit !== null &&
    quizMeta.attemptsSoFar >= quizMeta.attemptLimit
  ) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center space-y-4 p-6">
        <h1 className="text-3xl font-bold">{quizMeta.setName}</h1>
        {dueDateStr && (
          <p className="text-base text-gray-600">
            {t('ws-quizzes.due_on') || 'Due on'}:{' '}
            {new Date(dueDateStr).toLocaleString()}
          </p>
        )}
        <p className="text-lg">
          {t('ws-quizzes.attempts') || 'Attempts'}: {quizMeta.attemptsSoFar} /{' '}
          {quizMeta.attemptLimit}
        </p>
        {quizMeta.allowViewResults ? (
          <Button
            className="bg-green-600 text-white hover:bg-green-700"
            onClick={() =>
              router.push(
                `/dashboard/${wsId}/courses/${courseId}/modules/${moduleId}/quizzes/${setId}/results`
              )
            }
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

  // ─── “Take Quiz” button ──────────────────────────────────────────────────────
  if (!hasStarted) {
    return (
      <BeforeTakeQuizSection
        t={t}
        quizMeta={{
          setName: quizMeta.setName,
          attemptsSoFar: quizMeta.attemptsSoFar,
          attemptLimit: quizMeta.attemptLimit,
          timeLimitMinutes: quizMeta.timeLimitMinutes,
        }}
        dueDateStr={dueDateStr}
        onClickStart={onClickStart}
      />
    );
  }

  // ─── QUIZ FORM ───────────────────────────────────────────────────────────────
  const isCountdown = totalSeconds !== null;

  return (
    <div className="mx-auto flex max-w-6xl flex-col p-0 lg:flex-row lg:gap-6 lg:p-6">
      <div className="sticky top-0 z-10 mb-2 space-y-2 rounded-md bg-card/90 shadow backdrop-blur-xs lg:hidden">
        <div className="flex gap-2">
          <button
            className="group"
            onClick={() => setSidebarVisible(!sidebarVisible)}
          >
            <ListCheck
              size={32}
              className="text-dynamic-purple transition-colors duration-200 group-hover:text-dynamic-purple/70"
            />
          </button>
          <TimeElapsedStatus
            timeLeft={timeLeft}
            isCountdown={isCountdown}
            t={t}
          />
        </div>
        <div className="absolute top-16 right-0 left-0">
          {sidebarVisible && quizMeta && (
            <QuizStatusSidebar
              questions={quizMeta.questions}
              selectedAnswers={selectedAnswers}
              t={t}
            />
          )}
        </div>
      </div>

      <main className="order-2 w-full grow space-y-4 p-0.5 md:p-2 lg:order-1 lg:w-3/4 lg:p-0">
        <h1 className="text-3xl font-bold">{quizMeta.setName}</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="space-y-8"
        >
          {quizMeta.questions.map((q, idx) => (
            <div key={q.quizId} className="space-y-2" id={`question-${idx}`}>
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
              className={`w-full rounded px-6 py-5 text-white md:py-4 lg:w-fit lg:py-2 ${
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

      <aside className="relative order-1 hidden w-full lg:order-2 lg:block lg:w-5/12">
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
