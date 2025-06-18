'use client';

import { Alert, AlertDescription } from '@tuturuuu/ui/alert';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Separator } from '@tuturuuu/ui/separator';
import { RichTextEditor } from '@tuturuuu/ui/text-editor/editor';
import { JSONContent } from '@tuturuuu/ui/tiptap';
import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  Clock,
  Info,
  Play,
  RotateCcw,
  TriangleAlert,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export interface AttemptSummary {
  attemptId: string;
  attemptNumber: number;
  submittedAt: string; // ISO timestamp
  durationSeconds: number;
}

interface QuizData {
  setId: string;
  setName: string;
  availableDate: string | null;
  dueDate: string | null;
  attemptLimit: number | null;
  attemptsSoFar: number;
  timeLimitMinutes: number | null;
  allowViewOldAttempts: boolean;
  explanationMode: 0 | 1 | 2;
  instruction: string | null;
  resultsReleased: boolean;
  attempts: AttemptSummary[];
}

interface BeforeTakingQuizWholeProps {
  wsId: string;
  courseId: string;
  moduleId: string;
  setId: string;
  quizData: QuizData;
  isPastDue: boolean;
  isAvailable: boolean;
  onStart: () => void;
}

function formatDate(dateString: string | null) {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60)
    .toString()
    .padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function BeforeTakingQuizWhole({
  quizData,
  isPastDue,
  isAvailable,
  onStart,
  wsId,
  courseId,
  moduleId,
}: BeforeTakingQuizWholeProps) {
  const t = useTranslations('ws-quizzes');
  const router = useRouter();
  const [isStarting, setIsStarting] = useState(false);

  const attemptsRemaining = quizData.attemptLimit
    ? quizData.attemptLimit - quizData.attemptsSoFar
    : null;

  // MARK: modify if logic change to (cannot retake if result release)
  // once results are released, no more attempts allowed
  const canRetake =
    isAvailable &&
    !isPastDue &&
    (attemptsRemaining == null || attemptsRemaining > 0);
  // && !quizData.resultsReleased;

  // MARK: modify if logic changes to (can view result even not past due and attempt remain > 0)
  // At that time, add 1 variable to check view old attempts with result released
  const canViewResult =
    isAvailable &&
    quizData.resultsReleased &&
    (isPastDue || (!isPastDue && attemptsRemaining == 0));

  const canViewOldAttemptsNoResults =
    quizData.attemptsSoFar > 0 &&
    quizData.allowViewOldAttempts &&
    !quizData.resultsReleased;

  const canViewOldAttemptsResults = quizData.resultsReleased;

  const handleStartQuiz = () => {
    setIsStarting(true);
    setTimeout(() => {
      setIsStarting(false);
      onStart();
    }, 500);
  };

  const viewAttempt = (att: AttemptSummary) => {
    router.push(
      `/${wsId}/courses/${courseId}/modules/${moduleId}/quiz-sets/${quizData.setId}/result?attemptId=${att.attemptId}`
    );
  };

  return (
    <div className="px-4 py-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold text-primary">
            {quizData.setName}
          </h1>
          <p className="text-secondary-foreground">{t('quiz.review-info')}</p>

          {/* Start Button */}
          {canRetake && (
            <div className="text-center">
              <Button
                size="lg"
                onClick={handleStartQuiz}
                className="border border-dynamic-purple bg-dynamic-purple/20 px-8 py-3 text-lg text-primary hover:bg-primary-foreground hover:text-dynamic-purple"
              >
                {isStarting ? (
                  <>
                    <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" />
                    {t('quiz.starting-quiz')}
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-5 w-5" />
                    {t('quiz.start-quiz')}
                  </>
                )}
              </Button>
              <p className="mt-2 text-sm text-secondary-foreground">
                {t('quiz.click-to-begin')}
              </p>
            </div>
          )}
          {canViewResult && (
            <div className="text-center">
              <Button
                size="lg"
                onClick={() => {
                  router.push(
                    `/${wsId}/courses/${courseId}/modules/${moduleId}/quiz-sets/${quizData.setId}/result?attemptId=${quizData.attempts[0]?.attemptId}`
                  );
                }}
                className="border border-dynamic-purple bg-dynamic-purple/20 px-8 py-3 text-lg text-primary hover:bg-primary-foreground hover:text-dynamic-purple"
              >
                {t('quiz.view-result')}
              </Button>
              <p className="mt-2 text-sm text-secondary-foreground">
                {t('quiz.view-final-attempt')}
              </p>
            </div>
          )}
          {!isAvailable ? (
            <Alert variant="default" className="mt-4">
              <AlertDescription>
                {t('quiz.quiz-not-available-message')}
              </AlertDescription>
            </Alert>
          ) : (
            !quizData.resultsReleased &&
            (isPastDue || attemptsRemaining == 0) && (
              <Alert variant="destructive" className="mt-4 font-bold text-dynamic-red
              bg-dynamic-light-pink/30">
                <AlertDescription>
                  <TriangleAlert className="inline h-5 w-5 mr-2" />
                  {isPastDue
                    ? t('quiz.quiz-past-due-message')
                    : t('quiz.no-attempts-message')}
                </AlertDescription>
              </Alert>
            )
          )}
        </div>

        {/* Info & Schedule */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Quiz Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5" />
                {t('info.quiz-information')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-secondary-foreground">
                  {t('info.quiz-id')}
                </span>
                <Badge variant="outline">{quizData.setId}</Badge>
              </div>

              <Separator />
              <div className="flex justify-between">
                <span className="text-sm font-medium text-secondary-foreground">
                  {t('info.time-limit')}
                </span>
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4 text-dynamic-light-purple" />
                  <span className="text-sm">
                    {quizData.timeLimitMinutes
                      ? `${quizData.timeLimitMinutes} ${t('info.minutes')}`
                      : t('info.no-time-limit')}
                  </span>
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-secondary-foreground">
                  {t('info.attempts-used')}
                </span>
                <div className="flex items-center gap-1">
                  <RotateCcw className="h-4 w-4 text-dynamic-light-purple" />
                  <span className="text-sm">
                    {quizData.attemptsSoFar} /{' '}
                    {quizData.attemptLimit || '∞'}{' '}
                  </span>
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-secondary-foreground">
                  {t('info.explanations')}
                </span>
                <span>
                  {quizData.explanationMode === 0
                    ? t('info.explanation-modes.none')
                    : quizData.explanationMode === 1
                      ? t('info.explanation-modes.correct-after-release')
                      : t('info.explanation-modes.all-after-release')}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                {t('info.schedule')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-sm font-medium text-secondary-foreground">
                    {t('info.available-from')}
                  </span>
                  {isAvailable && (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  )}
                </div>
                <p>{formatDate(quizData.availableDate)}</p>
              </div>
              <Separator />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-secondary-foreground">
                    {t('info.due-date')}
                  </span>
                  {isPastDue && (
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                  )}
                </div>
                <p>{formatDate(quizData.dueDate)}</p>
              </div>
              {attemptsRemaining != null && (
                <>
                  <Separator />
                  <p className="text-center text-sm text-primary">
                    {attemptsRemaining}{' '}
                    {attemptsRemaining !== 1
                      ? t('info.attempts-remaining')
                      : t('info.attempt-remaining')}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Instructions */}
        <Card>
          <CardHeader>
            <CardTitle>{t('instructions.title')}</CardTitle>
            <CardDescription>{t('instructions.subtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            {quizData.instruction ? (
              // <p>{quizData.instruction}</p>
              <RichTextEditor
                content={quizData.instruction as unknown as JSONContent}
                readOnly
              />
            ) : (
              <div className="space-y-2 text-sm text-secondary-foreground">
                <p>• {t('instructions.default.stable-connection')}</p>
                <p>• {t('instructions.default.cannot-pause')}</p>
                <p>• {t('instructions.default.answer-all')}</p>
                <p>• {t('instructions.default.auto-save')}</p>
                {quizData.timeLimitMinutes && (
                  <p>
                    •{' '}
                    {t('instructions.default.time-limit', {
                      minutes: quizData.timeLimitMinutes,
                    })}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Past Attempts */}
        {quizData.attemptsSoFar > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>{t('past-attempts.title')}</CardTitle>
              <CardDescription>
                {canViewOldAttemptsNoResults
                  ? t('past-attempts.view-answers')
                  : canViewOldAttemptsResults
                    ? t('past-attempts.view-results')
                    : t('past-attempts.results-pending')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {quizData.attempts.map((att) => (
                <div
                  key={att.attemptId}
                  className="flex items-center justify-between"
                >
                  <div>
                    {t('past-attempts.attempt-info', {
                      number: att.attemptNumber,
                      date: formatDate(att.submittedAt),
                      duration: formatDuration(att.durationSeconds),
                    })}
                {/* <strong>#{att.attemptNumber}</strong> at{' '}
                    {formatDate(att.submittedAt)} (
                    {formatDuration(att.durationSeconds)}) */}
                  </div>
                  {(canViewOldAttemptsResults ||
                    canViewOldAttemptsNoResults) && (
                    <Button size="sm" onClick={() => viewAttempt(att)}>
                      {canViewOldAttemptsResults
                        ? t('past-attempts.view-results-button')
                        : t('past-attempts.view-details-button')}
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
