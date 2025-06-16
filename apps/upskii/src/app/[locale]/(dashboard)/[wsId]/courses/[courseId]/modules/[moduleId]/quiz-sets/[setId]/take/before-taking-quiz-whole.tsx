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
} from 'lucide-react';
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
          <p className="text-secondary-foreground">
            Review the information below before starting your exam
          </p>

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
                    Starting Quiz...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-5 w-5" />
                    Start Quiz
                  </>
                )}
              </Button>
              <p className="mt-2 text-sm text-secondary-foreground">
                {canRetake
                  ? 'Click to begin your attempt'
                  : quizData.resultsReleased
                    ? 'Results are out—no further attempts'
                    : isPastDue
                      ? 'Quiz is past due'
                      : !isAvailable
                        ? 'Quiz not yet available'
                        : 'No attempts remaining'}
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
                View Result
              </Button>
              <p className="mt-2 text-sm text-secondary-foreground">
                View result of your final attempt
              </p>
            </div>
          )}
          {!isAvailable ? (
            <Alert variant="default" className="mt-4">
              <AlertDescription>
                This quiz is not yet available. Please check back later.
              </AlertDescription>
            </Alert>
          ) : (
            !quizData.resultsReleased &&
            (isPastDue || attemptsRemaining == 0) && (
              <Alert variant="destructive" className="mt-4">
                <AlertDescription>
                  {isPastDue
                    ? 'This quiz is past its due date. You cannot start a new attempt at this time.'
                    : 'You have no attempts remaining for this quiz.'}
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
                Quiz Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-secondary-foreground">
                  Quiz ID
                </span>
                <Badge variant="outline">{quizData.setId}</Badge>
              </div>

              <Separator />
              <div className="flex justify-between">
                <span className="text-sm font-medium text-secondary-foreground">
                  Time Limit
                </span>
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4 text-dynamic-light-purple" />
                  <span className="text-sm">
                    {quizData.timeLimitMinutes
                      ? `${quizData.timeLimitMinutes} minutes`
                      : 'No time limit'}
                  </span>
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-secondary-foreground">
                  Attempts Used
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
                  Explanations
                </span>
                <span>
                  {quizData.explanationMode === 0
                    ? 'None'
                    : quizData.explanationMode === 1
                      ? 'Correct only after release'
                      : 'All after release'}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Schedule
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-sm font-medium text-secondary-foreground">
                    Available From
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
                    Due Date
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
                    {attemptsRemaining} attempt
                    {attemptsRemaining !== 1 ? 's' : ''} remaining
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Instructions */}
        <Card>
          <CardHeader>
            <CardTitle>Instructions</CardTitle>
            <CardDescription>Read before you begin</CardDescription>
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
                <p>• Make sure you have a stable internet connection</p>
                <p>• You cannot pause the quiz once started</p>
                <p>• All questions must be answered before submitting</p>
                <p>• Your progress will be automatically saved</p>
                {quizData.timeLimitMinutes && (
                  <li>You have {quizData.timeLimitMinutes} minutes</li>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Past Attempts */}
        {quizData.attemptsSoFar > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Past Attempts</CardTitle>
              <CardDescription>
                {canViewOldAttemptsNoResults
                  ? 'Click “View Details” to view your answers'
                  : canViewOldAttemptsResults
                    ? 'Click “View Details” to view your results'
                    : 'Results pending release'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {quizData.attempts.map((att) => (
                <div
                  key={att.attemptId}
                  className="flex items-center justify-between"
                >
                  <div>
                    <strong>#{att.attemptNumber}</strong> at{' '}
                    {formatDate(att.submittedAt)} (
                    {formatDuration(att.durationSeconds)})
                  </div>
                  {(canViewOldAttemptsResults ||
                    canViewOldAttemptsNoResults) && (
                    <Button size="sm" onClick={() => viewAttempt(att)}>
                      {canViewOldAttemptsResults
                        ? 'View Results'
                        : 'View Details'}
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
