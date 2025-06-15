'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';

interface Option {
  id: string;
  value: string;
  isCorrect: boolean;
  explanation: string | null;
}

interface DetailQuestion {
  quizId: string;
  question: string;
  scoreWeight: number;
  selectedOptionId: string | null;
  isCorrect: boolean;
  scoreAwarded: number;
  options: Option[];
}

interface AttemptDetail {
  attemptId: string;
  attemptNumber: number;
  totalScore: number;
  maxPossibleScore: number;
  startedAt: string;
  completedAt: string | null;
  durationSeconds: number;
  explanationMode: 0|1|2;
  questions: DetailQuestion[];
}

export default function AttemptDetailPage({
  params,
}: {
  params: {
    wsId: string;
    courseId: string;
    moduleId: string;
    setId: string;
    attemptId: string;
  };
}) {
  const { wsId, courseId, moduleId, setId, attemptId } = params;
  const t = useTranslations();
  const router = useRouter();

  const [detail, setDetail] = useState<AttemptDetail|null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/quiz-sets/${setId}/attempts/${attemptId}`
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Error');
        setDetail(json);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [setId, attemptId]);

  if (loading) return <p className="p-4">{t('ws-quizzes.loading')||'Loading...'}</p>;
  if (error)   return <p className="p-4 text-red-600">{error}</p>;
  if (!detail) return null;

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-6">
      <h1 className="text-2xl font-bold">
        {t('ws-quizzes.attempt')} #{detail.attemptNumber}
      </h1>
      <p>
        {t('ws-quizzes.score')}: {detail.totalScore} / {detail.maxPossibleScore}
      </p>
      <p className="text-sm text-gray-500">
        {t('ws-quizzes.duration')||'Duration'}: {Math.floor(detail.durationSeconds/60)}m{' '}
        {detail.durationSeconds % 60}s
      </p>
      <Button
        variant="outline"
        onClick={() =>
          router.push(
            `/dashboard/${wsId}/courses/${courseId}/modules/${moduleId}/quizzes/${setId}/attempts`
          )
        }
      >
        {t('ws-quizzes.back')||'Back to attempts'}
      </Button>

      {detail.questions.map((q, idx) => (
        <Card key={q.quizId}>
          <CardHeader>
            <CardTitle>
              {idx + 1}. {q.question}{' '}
              <span className="text-sm text-gray-500">
                ({t('ws-quizzes.points')||'Points'}: {q.scoreWeight})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {q.options.map((opt) => {
              const selected = opt.id === q.selectedOptionId;
              const correct = opt.isCorrect;
              const showExplanation =
                detail.explanationMode === 2 ||
                (detail.explanationMode === 1 && correct);

              return (
                <div
                  key={opt.id}
                  className={
                    `p-3 rounded-md border ` +
                    (correct
                      ? 'border-green-500 bg-green-50'
                      : selected
                      ? 'border-red-500 bg-red-50'
                      : 'border-gray-200')
                  }
                >
                  <div className="flex items-center justify-between">
                    <span className={selected ? 'font-semibold' : ''}>
                      {opt.value} {selected && '←'}
                    </span>
                    {correct && (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    )}
                  </div>
                  {showExplanation && opt.explanation && (
                    <p className="mt-2 text-sm text-gray-700">
                      {opt.explanation}
                    </p>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
