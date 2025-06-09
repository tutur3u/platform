import { Button } from '@tuturuuu/ui/button';
import React from 'react';

export default function PastDueSection({
  t,
  quizMeta,
  dueDateStr,
  wsId,
  courseId,
  moduleId,
  setId,
  router,
}: {
  t: (key: string) => string;
  quizMeta: {
    setName: string;
    allowViewResults: boolean;
  };
  dueDateStr?: string | null;
  wsId: string;
  courseId: string;
  moduleId: string;
  setId: string;
  router: {
    push: (url: string) => void;
  };
}) {
  return (
    <div className="mx-auto max-w-lg p-6 text-center">
      <h1 className="text-3xl font-bold">{quizMeta.setName}</h1>
      <p className="mt-4 text-red-600">
        {t('ws-quizzes.quiz_past_due') ||
          `This quiz was due on ${new Date(dueDateStr!).toLocaleString()}.`}
      </p>
      {quizMeta.allowViewResults && (
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
      )}
    </div>
  );
}
