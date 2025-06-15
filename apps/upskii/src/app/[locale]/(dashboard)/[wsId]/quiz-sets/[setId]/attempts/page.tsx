'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Button } from '@tuturuuu/ui/button';

interface AttemptSummary {
  attemptId: string;
  attemptNumber: number;
  totalScore: number;
  startedAt: string;
  completedAt: string | null;
  durationSeconds: number;
}

export default function AttemptsListPage({
  params,
}: {
  params: { wsId: string; courseId: string; moduleId: string; setId: string };
}) {
  const { wsId, courseId, moduleId, setId } = params;
  const t = useTranslations();
  const router = useRouter();

  const [attempts, setAttempts] = useState<AttemptSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/quiz-sets/${setId}/attempts`
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Error');
        setAttempts(json.attempts);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [setId]);

  if (loading) return <p className="p-4">{t('ws-quizzes.loading')||'Loading...'}</p>;
  if (error)   return <p className="p-4 text-red-600">{error}</p>;
  if (!attempts.length) {
    return <p className="p-4">{t('ws-quizzes.no_attempts_found')||'No attempts found.'}</p>;
  }

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-4">
      <h1 className="text-2xl font-bold">{t('ws-quizzes.past_attempts')||'Past Attempts'}</h1>
      {attempts.map((att) => (
        <Card key={att.attemptId} className="cursor-pointer hover:shadow-lg" onClick={() => {
          router.push(
            `/dashboard/${wsId}/courses/${courseId}/modules/${moduleId}/quizzes/${setId}/attempts/${att.attemptId}`
          );
        }}>
          <CardHeader>
            <CardTitle>
              {t('ws-quizzes.attempt')} #{att.attemptNumber}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex justify-between items-center">
            <div>
              <p>
                {t('ws-quizzes.score')}: {att.totalScore}
              </p>
              <p className="text-sm text-gray-500">
                {t('ws-quizzes.started_at')||'Started'}:{' '}
                {new Date(att.startedAt).toLocaleString()}
                {att.completedAt && (
                  <> | {t('ws-quizzes.completed_at')||'Completed'}:{' '}
                  {new Date(att.completedAt).toLocaleString()}</>
                )}
              </p>
            </div>
            <div className="text-right text-sm text-gray-600">
              {t('ws-quizzes.duration')||'Duration'}:{' '}
              {Math.floor(att.durationSeconds/60)}m {att.durationSeconds%60}s
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
