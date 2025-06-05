// File: app/(dashboard)/[wsId]/courses/[courseId]/modules/[moduleId]/quizzes/[setId]/results/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Button } from '@tuturuuu/ui/button';

type AttemptAnswer = {
  quizId: string;
  question: string;
  selectedOption: string | null; // now can be null
  correctOption: string;
  isCorrect: boolean;
  scoreAwarded: number;
};

type AttemptDTO = {
  attemptId: string;
  attemptNumber: number;
  totalScore: number;
  maxPossibleScore: number;
  startedAt: string;
  completedAt: string | null;
  answers: AttemptAnswer[];
};

export default function ViewResults({
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

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<AttemptDTO[] | null>(null);

  useEffect(() => {
    async function fetchResults() {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/v1/workspaces/${wsId}/quiz-sets/${setId}/results`
        );
        const json: { attempts?: AttemptDTO[]; error?: string } =
          await res.json();

        if (!res.ok) {
          setErrorMsg(json.error || 'Error loading results');
          setLoading(false);
          return;
        }
        setAttempts(json.attempts || []);
      } catch {
        setErrorMsg('Network error loading results');
      } finally {
        setLoading(false);
      }
    }
    fetchResults();
  }, [wsId, setId]);

  if (loading) {
    return (
      <p className="p-4">
        {t('ws-quizzes.loading') || 'Loading results...'}
      </p>
    );
  }
  if (errorMsg) {
    return (
      <div className="p-4">
        <p className="text-red-600">{errorMsg}</p>
        <Button
          className="mt-4 bg-gray-600 text-white hover:bg-gray-700"
          onClick={() => {
            router.back();
          }}
        >
          {t('ws-quizzes.back') || 'Back'}
        </Button>
      </div>
    );
  }
  if (!attempts || attempts.length === 0) {
    return (
      <div className="p-4">
        <p>{t('ws-quizzes.no_attempts_found') || 'No attempts found.'}</p>
        <Button
          className="mt-4 bg-gray-600 text-white hover:bg-gray-700"
          onClick={() => {
            router.back();
          }}
        >
          {t('ws-quizzes.back') || 'Back'}
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-8">
      <h1 className="text-3xl font-bold">
        {t('ws-quizzes.past_attempts') || 'Past Attempts'}
      </h1>

      {attempts.map((att) => (
        <div key={att.attemptId} className="border p-4 rounded shadow-sm">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-xl font-semibold">
              {t('ws-quizzes.attempt')} #{att.attemptNumber}
            </h2>
            <p className="text-sm text-gray-600">
              {t('ws-quizzes.scored') || 'Scored'}:{' '}
              {att.totalScore} / {att.maxPossibleScore}
            </p>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            {t('ws-quizzes.started_at') || 'Started at'}:{' '}
            {new Date(att.startedAt).toLocaleString()}
            {att.completedAt && (
              <>
                {' | '}
                {t('ws-quizzes.completed_at') || 'Completed at'}:{' '}
                {new Date(att.completedAt).toLocaleString()}
              </>
            )}
          </p>

          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="border px-2 py-1 text-left">
                  {t('ws-quizzes.#') || '#'}
                </th>
                <th className="border px-2 py-1 text-left">
                  {t('ws-quizzes.question') || 'Question'}
                </th>
                <th className="border px-2 py-1 text-left">
                  {t('ws-quizzes.your_answer') || 'Your Answer'}
                </th>
                <th className="border px-2 py-1 text-left">
                  {t('ws-quizzes.correct_answer') || 'Correct Answer'}
                </th>
                <th className="border px-2 py-1 text-left">
                  {t('ws-quizzes.points') || 'Points'}
                </th>
              </tr>
            </thead>
            <tbody>
              {att.answers.map((ans, idx) => (
                <tr
                  key={ans.quizId}
                  className={ans.isCorrect ? '' : 'bg-red-50'}
                >
                  <td className="border px-2 py-1">{idx + 1}</td>
                  <td className="border px-2 py-1">{ans.question}</td>
                  <td className="border px-2 py-1">
                    {ans.selectedOption === null
                      ? t('ws-quizzes.no_answer') || 'No Answer'
                      : ans.selectedOption}
                  </td>
                  <td className="border px-2 py-1">{ans.correctOption}</td>
                  <td className="border px-2 py-1">
                    {ans.scoreAwarded}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <Button
        className="mt-4 bg-blue-600 text-white hover:bg-blue-700"
        onClick={() => {
          // Navigate back to the quiz‐set overview
          router.push(
            `/dashboard/${wsId}/courses/${courseId}/modules/${moduleId}/quizzes`
          );
        }}
      >
        {t('ws-quizzes.back_to_list') || 'Back to Quiz List'}
      </Button>
    </div>
  );
}
