import { Button } from '@tuturuuu/ui/button';
import React from 'react';

export default function BeforeTakeQuizSection({
  t,
  quizMeta,
  dueDateStr,
  onClickStart,
}: {
  t: (key: string, options?: Record<string, any>) => string;
  quizMeta: {
    setName: string;
    attemptsSoFar: number;
    attemptLimit: number | null;
    timeLimitMinutes: number | null;
  };
  dueDateStr?: string | null;
  onClickStart: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center space-y-4 p-6">
      {dueDateStr && (
        <p className="text-base text-gray-600">
          {t('ws-quizzes.due_on') || 'Due on'}:{' '}
          {new Date(dueDateStr).toLocaleString()}
        </p>
      )}
      <h1 className="text-3xl font-bold">{quizMeta.setName}</h1>
      {quizMeta.attemptLimit !== null ? (
        <p className="text-lg">
          {t('ws-quizzes.attempts') || 'Attempts'}: {quizMeta.attemptsSoFar} /{' '}
          {quizMeta.attemptLimit}
        </p>
      ) : (
        <p className="text-lg">
          {t('ws-quizzes.attempts') || 'Attempts'}: {quizMeta.attemptsSoFar} /{' '}
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
        className="border border-dynamic-purple bg-dynamic-purple/20 text-white hover:bg-dynamic-purple/40"
        onClick={onClickStart}
      >
        {t('ws-quizzes.take_quiz') || 'Take Quiz'}
      </Button>
    </div>
  );
}
