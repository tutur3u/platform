'use client';

import { RefreshCw, Sparkles } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { BrutalCard } from '../shared';

export function QuizCompletionCard({
  correctCount,
  earnedScore,
  onRetry,
  totalCount,
  totalMaxScore,
  isQuizScorePublished = true,
  hasUnmarked = false,
  isDeadlinePassed = false,
}: {
  correctCount: number;
  earnedScore: number;
  onRetry: () => void;
  totalCount: number;
  totalMaxScore: number;
  isQuizScorePublished?: boolean;
  hasUnmarked?: boolean;
  isDeadlinePassed?: boolean;
}) {
  const t = useTranslations();
  const showResults = isQuizScorePublished && !hasUnmarked;

  return (
    <BrutalCard className="bg-background p-8 text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center border-2 border-border bg-dynamic-yellow text-foreground shadow-[3px_3px_0_var(--border)]">
        <Sparkles className="h-8 w-8" />
      </div>
      <h2 className="font-black text-3xl leading-tight tracking-normal">
        {t('courses.done')}
      </h2>
      <p className="mt-2 text-muted-foreground text-sm">
        {t('courses.quizPracticeCompleteDescription')}
      </p>

      {showResults ? (
        <div className="my-6 border-2 border-border bg-muted/20 p-5 shadow-[4px_4px_0_var(--border)]">
          <div className="font-black text-3xl text-primary">
            {t('courses.quizCorrectCount', {
              correct: correctCount,
              total: totalCount,
            })}
          </div>
          <div className="mt-2 font-bold text-muted-foreground text-sm">
            {t('courses.quizEarnedPoints', {
              points: earnedScore,
              total: totalMaxScore,
            })}
          </div>
        </div>
      ) : (
        <div className="my-6 border-2 border-border bg-muted/20 p-5 shadow-[4px_4px_0_var(--border)] space-y-1.5">
          <div className="font-black text-xl text-primary">
            {t('courses.quizScorePending') || 'Results Pending Teacher Review'}
          </div>
          <p className="text-muted-foreground text-xs leading-relaxed max-w-sm mx-auto">
            {t('courses.quizScorePendingDescription') ||
              'Your answers have been submitted. Results will be visible once the teacher publishes them.'}
          </p>
        </div>
      )}

      {isDeadlinePassed ? (
        <div className="mt-4 border-2 border-dashed border-destructive bg-destructive/10 p-4 text-center shadow-[3px_3px_0_var(--border)]">
          <p className="font-bold text-destructive text-sm">
            {t('courses.quizDeadlinePassedMessage') ||
              'The deadline for this quiz has passed. You can no longer retry.'}
          </p>
        </div>
      ) : (
        <Button
          onClick={onRetry}
          className="h-12 border-2 border-border bg-primary font-black text-primary-foreground shadow-[3px_3px_0_var(--border)] hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-[4px_4px_0_var(--border)] active:translate-y-0 active:shadow-[3px_3px_0_var(--border)]"
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          {t('courses.quizRetryPractice')}
        </Button>
      )}
    </BrutalCard>
  );
}
