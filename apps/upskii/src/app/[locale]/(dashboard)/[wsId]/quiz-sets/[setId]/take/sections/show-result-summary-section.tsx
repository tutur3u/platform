import { Button } from '@tuturuuu/ui/button';

export default function ShowResultSummarySection({
  t,
  submitResult,
  quizMeta,
  wsId,
  courseId,
  moduleId,
  router,
}: {
  t: (key: string) => string;
  submitResult: {
    attemptNumber: number;
    totalScore: number;
    maxPossibleScore: number;
  };
  quizMeta: {
    attemptLimit: number | null;
    setName: string;
    attemptsSoFar: number;
    timeLimitMinutes: number | null;
  };
  wsId: string;
  courseId: string;
  moduleId: string;
  router: {
    push: (url: string) => void;
  };
}) {
  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <h2 className="text-2xl font-bold">
        {t('ws-quizzes.results') || 'Results'}
      </h2>
      <p>
        {t('ws-quizzes.attempt')} #{submitResult.attemptNumber}{' '}
        {t('ws-quizzes.of')}{' '}
        {quizMeta.attemptLimit ?? t('ws-quizzes.unlimited')}
      </p>
      <p>
        {t('ws-quizzes.score')}: {submitResult.totalScore} /{' '}
        {submitResult.maxPossibleScore}
      </p>
      <Button
        className="mt-2 bg-blue-600 text-white hover:bg-blue-700"
        onClick={() =>
          router.push(
            `/dashboard/${wsId}/courses/${courseId}/modules/${moduleId}/quizzes`
          )
        }
      >
        {t('ws-quizzes.done') || 'Done'}
      </Button>
    </div>
  );
}
