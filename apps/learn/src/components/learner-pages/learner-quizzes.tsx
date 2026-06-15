'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Check, X } from '@tuturuuu/icons';
import {
  resetTulearnQuizSubmissions,
  submitTulearnQuizAnswer,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { ChoiceOptions } from './quiz-practice/choice-options';
import { QuizCompletionCard } from './quiz-practice/completion-card';
import { StructuredQuizPreview } from './quiz-practice/structured-preview';
import {
  getMatchingChoices,
  getMatchingPairs,
  getMultipleChoiceOptions,
  getQuizScore,
  getStringItems,
  isCompleteMatchingAnswer,
  isMatchingAnswer,
  type Quiz,
  type SelectedAnswer,
} from './quiz-practice/types';
import { BrutalCard, useStudentId } from './shared';

type QuizSubmission = {
  answer: unknown;
  created_at?: string | null;
  is_correct: boolean;
  quiz_id: string;
  selected_option_id: string | null;
};

function getExplanation(
  quiz: Quiz,
  selectedAnswer: SelectedAnswer
): string | null {
  if (!quiz.type || quiz.type === 'multiple_choice') {
    if (typeof selectedAnswer === 'number') {
      const selectedOption = quiz.quiz_options?.[selectedAnswer];
      if (selectedOption?.explanation) return selectedOption.explanation;
    }
  }
  return null;
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
  submissions,
}: {
  quizzes: Quiz[];
  moduleId: string;
  submissions?: QuizSubmission[];
}) {
  const t = useTranslations();
  const params = useParams();
  const studentId = useStudentId();
  const queryClient = useQueryClient();

  const normalizedSubmissions = useMemo(() => {
    const byQuiz = new Map<string, QuizSubmission>();
    for (const submission of submissions ?? []) {
      byQuiz.set(submission.quiz_id, submission);
    }
    return Array.from(byQuiz.values());
  }, [submissions]);

  // Find first unanswered quiz index based on historical submissions
  const initialIdx = useMemo(() => {
    if (normalizedSubmissions.length === 0) return 0;
    const firstUnanswered = quizzes.findIndex(
      (quiz) => !normalizedSubmissions.some((sub) => sub.quiz_id === quiz.id)
    );
    return firstUnanswered === -1 ? quizzes.length : firstUnanswered;
  }, [quizzes, normalizedSubmissions]);

  const [currentIdx, setCurrentIdx] = useState(() => {
    return initialIdx >= quizzes.length ? 0 : initialIdx;
  });
  const [selectedAnswer, setSelectedAnswer] = useState<SelectedAnswer>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [correctCount, setCorrectCount] = useState(() => {
    return normalizedSubmissions.filter((sub) => sub.is_correct).length;
  });

  const [earnedScore, setEarnedScore] = useState(() => {
    return quizzes.reduce((sum, quiz) => {
      const sub = normalizedSubmissions.find((s) => s.quiz_id === quiz.id);
      return sum + (sub?.is_correct ? getQuizScore(quiz) : 0);
    }, 0);
  });

  const [completed, setCompleted] = useState(() => {
    return initialIdx >= quizzes.length && quizzes.length > 0;
  });

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
  const matchingChoices = getMatchingChoices(currentQuiz.content);
  const orderingItems = getStringItems(currentQuiz.content, 'items');
  const currentScore = getQuizScore(currentQuiz);
  const canSubmit =
    currentQuiz.type === 'matching'
      ? isCompleteMatchingAnswer(selectedAnswer, matchingPairs.length)
      : selectedAnswer !== null;

  const handleSubmit = async () => {
    if (!canSubmit || isSubmitted || isSubmitting) return;

    setIsSubmitting(true);
    try {
      let selectedOptionId: string | null = null;
      let answerPayload: unknown = null;

      if (!currentQuiz.type || currentQuiz.type === 'multiple_choice') {
        const optionIdx = selectedAnswer as number;
        const targetOption = options[optionIdx];
        if (targetOption) {
          selectedOptionId = targetOption.id;
          answerPayload = { selectedIndex: optionIdx };
        }
      } else if (currentQuiz.type === 'true_false') {
        answerPayload = selectedAnswer as boolean;
      } else if (currentQuiz.type === 'ordering') {
        answerPayload = selectedAnswer as string[];
      } else if (
        currentQuiz.type === 'matching' &&
        isMatchingAnswer(selectedAnswer)
      ) {
        answerPayload = selectedAnswer;
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

      const correct =
        response && typeof response.is_correct === 'boolean'
          ? response.is_correct
          : false;

      setIsCorrect(correct);

      if (correct) {
        setCorrectCount((prev) => prev + 1);
        setEarnedScore((prev) => prev + getQuizScore(currentQuiz));
      }

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

  const handleRetry = async () => {
    try {
      await resetTulearnQuizSubmissions(
        params.wsId as string,
        params.courseId as string,
        moduleId,
        studentId
      );

      // Invalidate query to refresh submissions list
      queryClient.invalidateQueries({
        queryKey: [
          'tulearn',
          params.wsId,
          studentId,
          'course-module',
          params.courseId,
          moduleId,
        ],
      });

      setCurrentIdx(0);
      setSelectedAnswer(null);
      setIsSubmitted(false);
      setIsCorrect(null);
      setCorrectCount(0);
      setEarnedScore(0);
      setCompleted(false);
    } catch (err) {
      console.error('Failed to reset submissions:', err);
    }
  };

  if (completed) {
    const totalMaxScore = quizzes.reduce(
      (total, quiz) => total + getQuizScore(quiz),
      0
    );

    return (
      <QuizCompletionCard
        correctCount={correctCount}
        earnedScore={earnedScore}
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
            submittedCorrect={isCorrect}
            onSelect={setSelectedAnswer}
          />
        )}

        {currentQuiz.type === 'true_false' && (
          <ChoiceOptions
            kind="true_false"
            selectedAnswer={selectedAnswer}
            isSubmitted={isSubmitted}
            submittedCorrect={isCorrect}
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
            matchingChoices={matchingChoices}
            matchingPairs={matchingPairs}
            matchingPlaceholder={t('courses.quizSelectMatch')}
            orderingItems={orderingItems}
            selectedAnswer={selectedAnswer}
            isSubmitted={isSubmitted}
            notice={t('courses.quizMatchingOrderingNotice')}
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
            {getExplanation(currentQuiz, selectedAnswer) && (
              <div className="mt-2 text-foreground/85 text-sm leading-relaxed">
                <div className="border-dynamic-red/20 border-t pt-2">
                  <span className="mb-1 block font-bold text-xs uppercase tracking-wider opacity-70">
                    {t('courses.quizExplanation')}
                  </span>
                  <p className="text-foreground/85 text-sm leading-relaxed">
                    {getExplanation(currentQuiz, selectedAnswer)}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 flex items-center justify-end">
          {!isSubmitted ? (
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit || isSubmitting}
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
