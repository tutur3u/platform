/* eslint-disable no-undef */
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
  explanationMode: 0 | 1 | 2;
  instruction: string | null;
  releasePointsImmediately: boolean;
  attempts: AttemptSummary[];
}

interface BeforeTakingQuizWholeProps {
  quizData: QuizData;
  isPastDue: boolean;
  isAvailable: boolean;
  onStart: () => void;
}

const formatDate = (dateString: string | null) => {
  if (!dateString) return null;
  return new Date(dateString).toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};
const formatDuration = (secs: number) => {
  const m = Math.floor(secs / 60)
    .toString()
    .padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

export default function BeforeTakingQuizWhole({
  quizData,
  isPastDue,
  isAvailable,
  onStart,
}: BeforeTakingQuizWholeProps) {
  const [isStarting, setIsStarting] = useState(false);
  const router = useRouter();

  const attemptsRemaining = quizData.attemptLimit
    ? quizData.attemptLimit - quizData.attemptsSoFar
    : null;

  // You cannot start again if points are released
  const canRetake =
    isAvailable &&
    !isPastDue &&
    !((attemptsRemaining == 0) && quizData.releasePointsImmediately);

  const handleStartQuiz = () => {
    setIsStarting(true);
    // Simulate navigation delay
    setTimeout(() => {
      alert('Starting quiz... (This would navigate to the actual quiz)');
      setIsStarting(false);
      onStart(); // Call the onStart callback to handle actual quiz start logic
    }, 2000);
  };

  const viewAttemptDetailed = (att: AttemptSummary) => {
    router.push(
      `/dashboard/quizzes/${quizData.setId}/attempts/${att.attemptId}`
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
          <div className="text-center">
            <Button
              size="lg"
              onClick={handleStartQuiz}
              disabled={!canRetake || isStarting}
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
                ? "Click the button above when you're ready to begin"
                : quizData.releasePointsImmediately
                  ? 'Points have been released—no further attempts allowed.'
                  : 'You cannot start at this time.'}
            </p>
          </div>
        </div>

        {/* Status Alert */}
        {!canRetake && !quizData.releasePointsImmediately && (
          <Alert variant={isPastDue ? 'destructive' : 'default'}>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {isPastDue
                ? 'This quiz is overdue and can no longer be taken.'
                : !isAvailable
                  ? 'This quiz is not yet available.'
                  : 'You have no remaining attempts for this quiz.'}
            </AlertDescription>
          </Alert>
        )}

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

              <div className="flex items-center justify-between">
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

              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-secondary-foreground">
                  Attempts
                </span>
                <div className="flex items-center gap-1">
                  <RotateCcw className="h-4 w-4 text-dynamic-light-purple" />
                  <span className="text-sm">
                    {quizData.attemptsSoFar} of{' '}
                    {quizData.attemptLimit || 'unlimited'} used
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-secondary-foreground">
                  Explanations
                </span>
                <span className="text-sm">
                  {quizData.explanationMode === 0
                    ? 'None during or after'
                    : quizData.explanationMode === 1
                      ? 'Correct-only after release'
                      : 'All after release'}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Schedule Information */}
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
                <p className="text-sm text-primary">
                  {formatDate(quizData.availableDate) ||
                    'Immediately available'}
                </p>
              </div>

              <Separator />

              <div>
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-sm font-medium text-secondary-foreground">
                    Due Date
                  </span>
                  {isPastDue && (
                    <AlertTriangle className="h-4 w-4 text-dynamic-light-red" />
                  )}
                </div>
                <p className="text-sm text-primary">
                  {formatDate(quizData.dueDate) || 'No due date set'}
                </p>
              </div>

              {attemptsRemaining !== null && (
                <>
                  <Separator />
                  <div className="rounded-lg border border-dynamic-purple/40 bg-transparent p-3 text-center">
                    <p className="text-sm font-medium text-dynamic-purple">
                      {attemptsRemaining} attempt
                      {attemptsRemaining !== 1 ? 's' : ''} remaining
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Instructions */}
        <Card>
          <CardHeader>
            <CardTitle>Instructions</CardTitle>
            <CardDescription>
              Please read carefully before starting
            </CardDescription>
          </CardHeader>
          <CardContent>
            {quizData.instruction ? (
              <p className="text-sm text-secondary-foreground">
                {quizData.instruction}
              </p>
            ) : (
              <div className="space-y-2 text-sm text-secondary-foreground">
                <p>• Make sure you have a stable internet connection</p>
                <p>• You cannot pause the quiz once started</p>
                <p>• All questions must be answered before submitting</p>
                <p>• Your progress will be automatically saved</p>
                {quizData.timeLimitMinutes && (
                  <p>
                    • You have {quizData.timeLimitMinutes} minutes to complete
                    this quiz
                  </p>
                )}
                {quizData.explanationMode === 0 && (
                  <p>• Answer explanations will be shown after submission</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {quizData.attempts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Past Attempts</CardTitle>
              <CardDescription>
                {quizData.releasePointsImmediately
                  ? 'You can review your detailed answers below.'
                  : 'You can view summary until points are released.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {quizData.attempts.map((att) => (
                <div
                  key={att.attemptId}
                  className="flex items-center justify-between"
                >
                  <div>
                    <strong>Attempt #{att.attemptNumber}</strong> —{' '}
                    {formatDate(att.submittedAt)} — duration{' '}
                    {formatDuration(att.durationSeconds)}
                  </div>
                  {quizData.releasePointsImmediately ? (
                    <Button size="sm" onClick={() => viewAttemptDetailed(att)}>
                      View Details
                    </Button>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
