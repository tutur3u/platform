'use client';

import { Check } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ChoiceOptions } from './quiz-practice/choice-options';
import { QuizCompletionCard } from './quiz-practice/completion-card';
import { StructuredQuizPreview } from './quiz-practice/structured-preview';
import {
  getMatchingPairs,
  getMultipleChoiceOptions,
  getQuizScore,
  getStringItems,
  type Quiz,
  type SelectedAnswer,
} from './quiz-practice/types';
import { BrutalCard } from './shared';

export function LearnerQuizzes({ quizzes }: { quizzes: Quiz[] }) {
  const t = useTranslations();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<SelectedAnswer>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [completed, setCompleted] = useState(false);

  if (!quizzes || quizzes.length === 0) {
    return (
      <BrutalCard className="p-6 text-center">
        <p className="text-muted-foreground">{t('common.empty')}</p>
      </BrutalCard>
    );
  }

  const currentQuiz = quizzes[currentIdx];
  if (!currentQuiz) return null;

  const options = getMultipleChoiceOptions(currentQuiz);
  const matchingPairs = getMatchingPairs(currentQuiz.content);
  const orderingItems = getStringItems(currentQuiz.content, 'items');
  const currentScore = getQuizScore(currentQuiz);

  const handleSubmit = () => {
    if (selectedAnswer === null || isSubmitted) return;
    setCompletedCount((prev) => Math.max(prev, currentIdx + 1));
    setIsSubmitted(true);
  };

  const handleNext = () => {
    setSelectedAnswer(null);
    setIsSubmitted(false);

    if (currentIdx + 1 < quizzes.length) {
      setCurrentIdx((prev) => prev + 1);
    } else {
      setCompleted(true);
    }
  };

  const handleRetry = () => {
    setCurrentIdx(0);
    setSelectedAnswer(null);
    setIsSubmitted(false);
    setCompletedCount(0);
    setCompleted(false);
  };

  if (completed) {
    const totalMaxScore = quizzes.reduce(
      (total, quiz) => total + getQuizScore(quiz),
      0
    );

    return (
      <QuizCompletionCard
        completedCount={completedCount}
        totalCount={quizzes.length}
        totalMaxScore={totalMaxScore}
        onRetry={handleRetry}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-2 border-border bg-muted/40 px-4 py-2.5 shadow-[2px_2px_0_var(--border)]">
        <span className="font-bold text-muted-foreground text-xs uppercase tracking-widest">
          {t('courses.quizQuestionProgress', {
            current: currentIdx + 1,
            total: quizzes.length,
          })}
        </span>
        <span className="font-black text-primary text-sm">
          {t('courses.quizXp', { xp: currentScore })}
        </span>
      </div>

      <BrutalCard className="p-6 md:p-8">
        <h3 className="font-black text-xl leading-snug tracking-normal md:text-2xl">
          {currentQuiz.question}
        </h3>

        {(!currentQuiz.type || currentQuiz.type === 'multiple_choice') && (
          <ChoiceOptions
            kind="multiple_choice"
            options={options}
            selectedAnswer={selectedAnswer}
            isSubmitted={isSubmitted}
            onSelect={setSelectedAnswer}
          />
        )}

        {currentQuiz.type === 'true_false' && (
          <ChoiceOptions
            kind="true_false"
            selectedAnswer={selectedAnswer}
            isSubmitted={isSubmitted}
            labels={{
              false: t('courses.quizFalse'),
              true: t('courses.quizTrue'),
            }}
            onSelect={setSelectedAnswer}
          />
        )}

        {(currentQuiz.type === 'matching' ||
          currentQuiz.type === 'ordering') && (
          <StructuredQuizPreview
            type={currentQuiz.type}
            matchingPairs={matchingPairs}
            orderingItems={orderingItems}
            selectedAnswer={selectedAnswer}
            isSubmitted={isSubmitted}
            notice={t('courses.quizMatchingOrderingNotice')}
            confirmLabel={t('courses.quizConfirmSolved')}
            onConfirm={() => setSelectedAnswer(true)}
          />
        )}

        {isSubmitted && (
          <div className="mt-6 border-2 border-dynamic-green/30 bg-dynamic-green/10 p-4 text-dynamic-green shadow-[3px_3px_0_hsl(var(--dynamic-green)/0.2)]">
            <div className="flex items-center gap-2 font-black">
              <Check className="h-5 w-5" />
              <span>{t('courses.quizResponseRecorded')}</span>
            </div>
            <p className="mt-2 text-foreground/80 text-sm leading-relaxed">
              {t('courses.quizResponseRecordedDescription')}
            </p>
          </div>
        )}

        <div className="mt-6 flex items-center justify-end">
          {!isSubmitted ? (
            <Button
              onClick={handleSubmit}
              disabled={selectedAnswer === null}
              className="h-12 border-2 border-border bg-primary font-black text-primary-foreground shadow-[3px_3px_0_var(--border)] hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-[4px_4px_0_var(--border)] active:translate-y-0 active:shadow-[3px_3px_0_var(--border)] disabled:opacity-50"
            >
              {t('courses.quizSubmitAnswer')}
            </Button>
          ) : (
            <Button
              onClick={handleNext}
              className="h-12 border-2 border-border bg-dynamic-green font-black text-dynamic-green-foreground shadow-[3px_3px_0_var(--border)] hover:-translate-y-0.5 hover:bg-dynamic-green/90 hover:shadow-[4px_4px_0_var(--border)] active:translate-y-0 active:shadow-[3px_3px_0_var(--border)]"
            >
              {currentIdx + 1 < quizzes.length
                ? t('courses.quizNextQuestion')
                : t('courses.quizFinishPractice')}
            </Button>
          )}
        </div>
      </BrutalCard>
    </div>
  );
}
