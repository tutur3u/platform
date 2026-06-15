'use client';

import { Check, X } from '@tuturuuu/icons';
import { submitTulearnQuizAnswer } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { ChoiceOptions } from './quiz-practice/choice-options';
import { QuizCompletionCard } from './quiz-practice/completion-card';
import { StructuredQuizPreview } from './quiz-practice/structured-preview';
import {
  type DisplayOption,
  getMatchingPairs,
  getMultipleChoiceOptions,
  getQuizScore,
  getStringItems,
  type Quiz,
  type SelectedAnswer,
} from './quiz-practice/types';
import { BrutalCard, useStudentId } from './shared';

function getExplanation(
  quiz: Quiz,
  selectedAnswer: SelectedAnswer
): string | null {
  if (!quiz.type || quiz.type === 'multiple_choice') {
    const correctOption = quiz.quiz_options?.find((o) => o.is_correct);
    if (correctOption?.explanation) return correctOption.explanation;
    if (typeof selectedAnswer === 'number') {
      const selectedOption = quiz.quiz_options?.[selectedAnswer];
      if (selectedOption?.explanation) return selectedOption.explanation;
    }
  }
  return null;
}

function getCorrectAnswerString(
  quiz: Quiz,
  options: DisplayOption[],
  t: (key: string) => string
): string {
  if (!quiz.type || quiz.type === 'multiple_choice') {
    const correctOption = options.find((o) => o.is_correct);
    if (correctOption) return correctOption.value;

    // Fallback for legacy multiple choice quizzes
    const correctIndex = (quiz.answer as any)?.correctIndex;
    if (correctIndex !== undefined && options[correctIndex]) {
      return options[correctIndex].value;
    }
    return '';
  }
  if (quiz.type === 'true_false') {
    const tfCorrect = (quiz.answer as any)?.correct ?? true;
    return tfCorrect ? t('courses.quizTrue') : t('courses.quizFalse');
  }
  if (quiz.type === 'ordering') {
    const correctOrder = getStringItems(quiz.content, 'items');
    return correctOrder.join(' ➔ ');
  }
  return '';
}

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = arr[i];
    const target = arr[j];
    if (temp !== undefined && target !== undefined) {
      arr[i] = target;
      arr[j] = temp;
    }
  }
  return arr;
}

export function LearnerQuizzes({
  quizzes,
  moduleId,
}: {
  quizzes: Quiz[];
  moduleId: string;
}) {
  const t = useTranslations();
  const params = useParams();
  const studentId = useStudentId();

  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<SelectedAnswer>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [completed, setCompleted] = useState(false);

  const currentQuiz = quizzes[currentIdx];

  // Initialize selectedAnswer with shuffled list for ordering quizzes
  useEffect(() => {
    if (currentQuiz?.type === 'ordering') {
      const items = getStringItems(currentQuiz.content, 'items');
      let shuffled = [...items];
      if (items.length > 1) {
        let attempts = 0;
        while (attempts < 10) {
          shuffled = shuffleArray(items);
          if (shuffled.some((val, idx) => val !== items[idx])) {
            break;
          }
          attempts++;
        }
      }
      setSelectedAnswer(shuffled);
    } else {
      setSelectedAnswer(null);
    }
  }, [currentQuiz]);

  if (!quizzes || quizzes.length === 0) {
    return (
      <BrutalCard className="p-6 text-center">
        <p className="text-muted-foreground">{t('common.empty')}</p>
      </BrutalCard>
    );
  }

  if (!currentQuiz) return null;

  const options = getMultipleChoiceOptions(currentQuiz);
  const matchingPairs = getMatchingPairs(currentQuiz.content);
  const orderingItems = getStringItems(currentQuiz.content, 'items');
  const currentScore = getQuizScore(currentQuiz);

  const handleSubmit = async () => {
    if (selectedAnswer === null || isSubmitted || isSubmitting) return;

    setIsSubmitting(true);
    try {
      let calculatedCorrect = false;
      let selectedOptionId: string | null = null;
      let answerPayload: any = null;

      if (!currentQuiz.type || currentQuiz.type === 'multiple_choice') {
        const optionIdx = selectedAnswer as number;
        const targetOption = options[optionIdx];
        if (targetOption) {
          selectedOptionId = targetOption.id;
          if (targetOption.is_correct !== undefined) {
            calculatedCorrect = !!targetOption.is_correct;
          } else {
            const correctIndex = (currentQuiz.answer as any)?.correctIndex;
            calculatedCorrect =
              correctIndex !== undefined && Number(correctIndex) === optionIdx;
          }
          answerPayload = optionIdx;
        }
      } else if (currentQuiz.type === 'true_false') {
        const tfVal = selectedAnswer as boolean;
        const tfCorrect = (currentQuiz.answer as any)?.correct ?? true;
        calculatedCorrect = tfVal === tfCorrect;
        answerPayload = tfVal;
      } else if (currentQuiz.type === 'ordering') {
        const submittedOrder = selectedAnswer as string[];
        const correctOrder = orderingItems;
        calculatedCorrect =
          submittedOrder.length === correctOrder.length &&
          submittedOrder.every((val, idx) => val === correctOrder[idx]);
        answerPayload = submittedOrder;
      } else if (currentQuiz.type === 'matching') {
        calculatedCorrect = true;
        answerPayload = true;
      }

      const response = await submitTulearnQuizAnswer(
        params.wsId as string,
        params.courseId as string,
        moduleId,
        {
          quizId: currentQuiz.id,
          selectedOptionId,
          answer: answerPayload,
        },
        studentId
      );

      if (response && typeof response.is_correct === 'boolean') {
        setIsCorrect(response.is_correct);
      } else {
        setIsCorrect(calculatedCorrect);
      }

      setCompletedCount((prev) => Math.max(prev, currentIdx + 1));
      setIsSubmitted(true);
    } catch (err) {
      console.error('Failed to submit answer:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNext = () => {
    setSelectedAnswer(null);
    setIsSubmitted(false);
    setIsCorrect(null);

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
    setIsCorrect(null);
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
            correctAnswer={(currentQuiz.answer as any)?.correct}
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
            onConfirm={(val) => setSelectedAnswer(val)}
          />
        )}

        {isSubmitted && isCorrect && (
          <div className="mt-6 border-2 border-dynamic-green/30 bg-dynamic-green/10 p-4 text-dynamic-green shadow-[3px_3px_0_hsl(var(--dynamic-green)/0.2)]">
            <div className="flex items-center gap-2 font-black">
              <Check className="h-5 w-5" />
              <span>{t('courses.quizCorrect')}</span>
            </div>
            {getExplanation(currentQuiz, selectedAnswer) && (
              <div className="mt-2 border-dynamic-green/20 border-t pt-2">
                <span className="mb-1 block font-bold text-xs uppercase tracking-wider opacity-70">
                  {t('courses.quizExplanation')}
                </span>
                <p className="text-foreground/85 text-sm leading-relaxed">
                  {getExplanation(currentQuiz, selectedAnswer)}
                </p>
              </div>
            )}
          </div>
        )}

        {isSubmitted && !isCorrect && (
          <div className="mt-6 border-2 border-dynamic-red/30 bg-dynamic-red/10 p-4 text-dynamic-red shadow-[3px_3px_0_hsl(var(--dynamic-red)/0.2)]">
            <div className="flex items-center gap-2 font-black">
              <X className="h-5 w-5" />
              <span>{t('courses.quizIncorrect')}</span>
            </div>
            <div className="mt-2 space-y-2 text-foreground/85 text-sm leading-relaxed">
              <p>
                <span className="mb-1 block font-bold text-xs uppercase tracking-wider opacity-70">
                  {t('courses.quizCorrectAnswer')}
                </span>
                <span className="font-black text-foreground">
                  {getCorrectAnswerString(currentQuiz, options, t)}
                </span>
              </p>
              {getExplanation(currentQuiz, selectedAnswer) && (
                <div className="border-dynamic-red/20 border-t pt-2">
                  <span className="mb-1 block font-bold text-xs uppercase tracking-wider opacity-70">
                    {t('courses.quizExplanation')}
                  </span>
                  <p className="text-foreground/85 text-sm leading-relaxed">
                    {getExplanation(currentQuiz, selectedAnswer)}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-6 flex items-center justify-end">
          {!isSubmitted ? (
            <Button
              onClick={handleSubmit}
              disabled={selectedAnswer === null || isSubmitting}
              className="h-12 border-2 border-border bg-primary font-black text-primary-foreground shadow-[3px_3px_0_var(--border)] hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-[4px_4px_0_var(--border)] active:translate-y-0 active:shadow-[3px_3px_0_var(--border)] disabled:opacity-50"
            >
              {isSubmitting
                ? t('common.loading')
                : t('courses.quizSubmitAnswer')}
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
