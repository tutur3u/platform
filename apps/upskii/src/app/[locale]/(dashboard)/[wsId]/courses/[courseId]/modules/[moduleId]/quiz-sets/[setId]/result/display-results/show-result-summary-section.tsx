'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Progress } from '@tuturuuu/ui/progress';
import { Separator } from '@tuturuuu/ui/separator';
import {
  CheckCircle,
  RotateCcw,
  Target,
  Trophy,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

export interface ShowResultSummarySectionProps {
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
  setId: string;
}

export default function ShowResultSummarySection({
  t,
  submitResult,
  quizMeta,
  wsId,
  courseId,
  moduleId,
  setId,
}: ShowResultSummarySectionProps) {
  const router = useRouter();

  const scorePercentage = Math.round(
    (submitResult.totalScore / submitResult.maxPossibleScore) * 100
  );
  const attemptsRemaining = quizMeta.attemptLimit
    ? quizMeta.attemptLimit - quizMeta.attemptsSoFar
    : null;
  // const canRetake = attemptsRemaining === null || attemptsRemaining > 0;

  const getScoreColor = (percentage: number) => {
    if (percentage >= 90) return 'text-dynamic-green';
    if (percentage >= 70) return 'text-dynamic-purple';
    if (percentage >= 50) return 'text-yellow-600';
    return 'text-rose-600';
  };

  const getScoreBadgeVariant = (percentage: number) => {
    if (percentage >= 90) return 'default';
    if (percentage >= 70) return 'secondary';
    if (percentage >= 50) return 'outline';
    return 'destructive';
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      {/* Header */}
      <div className="space-y-2 text-center">
        <div className="mb-4 flex items-center justify-center">
          <div className="rounded-full bg-dynamic-light-green/50 p-3">
            <CheckCircle className="h-8 w-8 text-dynamic-green" />
          </div>
        </div>
        <h1 className="text-3xl font-bold text-primary">
          {t('ws-quizzes.quiz-completed') || 'Quiz Completed!'}
        </h1>
        <p className="text-secondary-foreground">{quizMeta.setName}</p>
      </div>

      {/* Score Card */}
      <Card className="border-2">
        <CardHeader className="pb-2 text-center">
          <CardTitle className="flex items-center justify-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-600" />
            {t('ws-quizzes.your-score') || 'Your Score'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center">
            <div
              className={`text-4xl font-bold ${getScoreColor(scorePercentage)}`}
            >
              {submitResult.totalScore} / {submitResult.maxPossibleScore}
            </div>
            <Badge
              variant={getScoreBadgeVariant(scorePercentage)}
              className="mt-2"
            >
              {scorePercentage}%
            </Badge>
          </div>

          <Progress value={scorePercentage} className="h-3" />

          <div className="flex justify-between text-sm text-secondary-foreground">
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
        </CardContent>
      </Card>

      {/* Attempt Information */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-dynamic-purple/30 p-2">
                <Target className="h-4 w-4 text-dynamic-purple" />
              </div>
              <div>
                <p className="text-sm font-medium text-primary">
                  {t('ws-quizzes.attempt') || 'Attempt'}
                </p>
                <p className="text-sm text-secondary-foreground">
                  #{submitResult.attemptNumber} {t('ws-quizzes.of') || 'of'}{' '}
                  {quizMeta.attemptLimit ??
                    (t('ws-quizzes.unlimited') || 'Unlimited')}
                </p>
              </div>
            </div>

            {attemptsRemaining !== null && (
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-dynamic-light-purple/30 p-2">
                  <RotateCcw className="h-4 w-4 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-primary">
                    {t('ws-quizzes.attempts-remaining') || 'Attempts Remaining'}
                  </p>
                  <p className="text-sm text-secondary-foreground">
                    {attemptsRemaining} {t('ws-quizzes.left') || 'left'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Performance Feedback */}
      <Card className="border-dynamic-purple/50 bg-gradient-to-r from-dynamic-purple/20 to-dynamic-light-purple/30">
        <CardContent className="pt-6">
          <div className="space-y-2 text-center">
            <h3 className="font-semibold text-primary">
              {scorePercentage >= 90
                ? t('ws-quizzes.excellent-work') || 'Excellent Work!'
                : scorePercentage >= 70
                  ? t('ws-quizzes.good-job') || 'Good Job!'
                  : scorePercentage >= 50
                    ? t('ws-quizzes.keep-practicing') || 'Keep Practicing!'
                    : t('ws-quizzes.needs-improvement') || 'Needs Improvement'}
            </h3>
            <p className="text-sm text-secondary-foreground">
              {scorePercentage >= 90
                ? t('ws-quizzes.outstanding-performance') ||
                  'Outstanding performance! You have mastered this material.'
                : scorePercentage >= 70
                  ? t('ws-quizzes.solid-understanding') ||
                    'You show a solid understanding of the material.'
                  : scorePercentage >= 50
                    ? t('ws-quizzes.room-for-improvement') ||
                      "There's room for improvement. Consider reviewing the material."
                    : t('ws-quizzes.review-recommended') ||
                      'We recommend reviewing the material and trying again.'}
            </p>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Action Buttons */}
      <div className="flex flex-col justify-center gap-3 sm:flex-row">
        <Button
          variant="outline"
          onClick={() => router.push(`/${wsId}/courses/${courseId}/modules/${moduleId}/quiz-sets/${setId}/take`)}
          className="flex items-center gap-2"
        >
          <RotateCcw className="h-4 w-4" />
          {t('ws-quizzes.back-take-quiz') || 'Back to Quiz Page'}
        </Button>
      </div>

      {/* Additional Info */}
      <div className="space-y-1 text-center text-sm text-muted-foreground">
        <p>
          {t('ws-quizzes.quiz-completed-at') || 'Quiz completed at'}{' '}
          {new Date().toLocaleString()}
        </p>
        {quizMeta.timeLimitMinutes && (
          <p>
            {t('ws-quizzes.time-limit') || 'Time limit'}:{' '}
            {quizMeta.timeLimitMinutes} {t('ws-quizzes.minutes') || 'minutes'}
          </p>
        )}
      </div>
    </div>
  );
}
