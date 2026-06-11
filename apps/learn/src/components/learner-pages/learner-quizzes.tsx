'use client';

import { AlertCircle, Check, RefreshCw, Sparkles, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { BrutalCard } from './shared';

interface Quiz {
  id: string;
  question: string;
  type: string | null;
  content: any;
  answer: any;
  explanation?: string | null;
  score: number;
}

export function LearnerQuizzes({ quizzes }: { quizzes: Quiz[] }) {
  const t = useTranslations();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<any>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [completed, setCompleted] = useState(false);

  if (!quizzes || quizzes.length === 0) {
    return (
      <BrutalCard className="p-6 text-center">
        <p className="text-muted-foreground">{t('common.empty')}</p>
      </BrutalCard>
    );
  }

  const currentQuiz = quizzes[currentIdx] as Quiz | undefined;

  if (!currentQuiz) {
    return null;
  }

  const getMultipleChoiceOptions = (quiz: Quiz) => {
    const contentOptions = Array.isArray(quiz?.content?.options)
      ? quiz.content.options.filter((o: unknown) => typeof o === 'string')
      : [];
    const hasQuizOptions =
      Array.isArray((quiz as any).quiz_options) &&
      (quiz as any).quiz_options.length > 0;

    if (
      contentOptions.length > 0 &&
      (!hasQuizOptions || typeof quiz.answer?.correctIndex === 'number')
    ) {
      return contentOptions.map((value: string, index: number) => ({
        value,
        isCorrect:
          typeof quiz.answer?.correctIndex === 'number'
            ? quiz.answer.correctIndex === index
            : false,
        explanation: null,
      }));
    }
    return ((quiz as any).quiz_options ?? []).map((o: any) => ({
      value: o?.value ?? '',
      isCorrect: Boolean(o?.is_correct),
      explanation: o?.explanation ?? null,
    }));
  };

  const options = getMultipleChoiceOptions(currentQuiz);

  const handleSelectOption = (optionIdx: number) => {
    if (isSubmitted) return;
    setSelectedAnswers(optionIdx);
  };

  const handleSelectTrueFalse = (val: boolean) => {
    if (isSubmitted) return;
    setSelectedAnswers(val);
  };

  const checkAnswer = (): boolean => {
    if (!currentQuiz) return false;

    if (currentQuiz.type === 'true_false') {
      const correctVal = currentQuiz.answer?.correct ?? false;
      return String(selectedAnswers).toLowerCase() === String(correctVal).toLowerCase();
    }

    if (!currentQuiz.type || currentQuiz.type === 'multiple_choice') {
      const opts = getMultipleChoiceOptions(currentQuiz);
      const selectedOpt = opts[selectedAnswers];
      return selectedOpt ? selectedOpt.isCorrect : false;
    }

    // Matching/Ordering fallback check
    return true;
  };

  const handleSubmit = () => {
    if (selectedAnswers === null || isSubmitted) return;
    const isCorrect = checkAnswer();
    if (isCorrect) {
      setScore((prev) => prev + (currentQuiz.score || 1));
    }
    setIsSubmitted(true);
  };

  const handleNext = () => {
    setSelectedAnswers(null);
    setIsSubmitted(false);

    if (currentIdx + 1 < quizzes.length) {
      setCurrentIdx((prev) => prev + 1);
    } else {
      setCompleted(true);
    }
  };

  const handleRetry = () => {
    setCurrentIdx(0);
    setSelectedAnswers(null);
    setIsSubmitted(false);
    setScore(0);
    setCompleted(false);
  };

  if (completed) {
    const totalMaxScore = quizzes.reduce((acc, q) => acc + (q.score || 1), 0);
    const percentage = Math.round((score / totalMaxScore) * 100);

    return (
      <BrutalCard className="bg-background p-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center border-2 border-border bg-dynamic-yellow text-foreground shadow-[3px_3px_0_var(--border)]">
          <Sparkles className="h-8 w-8" />
        </div>
        <h2 className="font-black text-3xl leading-tight tracking-normal">
          {t('courses.done')}
        </h2>
        <p className="mt-2 text-muted-foreground text-sm">
          You have completed all practice questions for this module!
        </p>

        <div className="my-6 border-2 border-border bg-muted/20 p-5 shadow-[4px_4px_0_var(--border)]">
          <div className="font-black text-5xl text-primary">{percentage}%</div>
          <div className="mt-2 font-bold text-muted-foreground text-sm">
            Score: {score} / {totalMaxScore} points
          </div>
        </div>

        <Button
          onClick={handleRetry}
          className="h-12 border-2 border-border bg-primary font-black text-primary-foreground shadow-[3px_3px_0_var(--border)] hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-[4px_4px_0_var(--border)] active:translate-y-0 active:shadow-[3px_3px_0_var(--border)]"
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry Practice
        </Button>
      </BrutalCard>
    );
  }

  const isAnswerCorrect = isSubmitted && checkAnswer();

  return (
    <div className="space-y-6">
      {/* Quiz Progress Header */}
      <div className="flex items-center justify-between border-2 border-border bg-muted/40 px-4 py-2.5 shadow-[2px_2px_0_var(--border)]">
        <span className="font-bold text-muted-foreground text-xs uppercase tracking-widest">
          Question {currentIdx + 1} of {quizzes.length}
        </span>
        <span className="font-black text-primary text-sm">
          +{currentQuiz.score || 1} XP
        </span>
      </div>

      <BrutalCard className="p-6 md:p-8">
        <h3 className="font-black text-xl leading-snug tracking-normal md:text-2xl">
          {currentQuiz.question}
        </h3>

        {/* Multiple Choice Rendering */}
        {(!currentQuiz.type || currentQuiz.type === 'multiple_choice') && (
          <div className="mt-6 grid gap-3">
            {options.map((option: any, idx: number) => {
              const isSelected = selectedAnswers === idx;

              let buttonStyle = 'bg-background hover:bg-muted/10';
              if (isSelected && !isSubmitted) {
                buttonStyle =
                  'border-primary bg-primary/5 text-primary shadow-[4px_4px_0_var(--border)]';
              } else if (isSubmitted) {
                if (option.isCorrect) {
                  buttonStyle =
                    'border-dynamic-green bg-dynamic-green/10 text-dynamic-green shadow-[4px_4px_0_hsl(var(--dynamic-green)/0.2)]';
                } else if (isSelected && !option.isCorrect) {
                  buttonStyle =
                    'border-destructive bg-destructive/10 text-destructive';
                } else {
                  buttonStyle = 'opacity-60';
                }
              }

              return (
                <button
                  key={idx}
                  onClick={() => handleSelectOption(idx)}
                  disabled={isSubmitted}
                  className={cn(
                    'w-full border-2 border-border p-4 text-left font-bold text-sm shadow-[3px_3px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--border)] active:translate-y-0 disabled:hover:translate-y-0 disabled:hover:shadow-[3px_3px_0_var(--border)]',
                    buttonStyle
                  )}
                  type="button"
                >
                  <span className="mr-3 inline-flex h-6 w-6 items-center justify-center border-2 border-border bg-muted text-xs">
                    {String.fromCharCode(65 + idx)}
                  </span>
                  {option.value}
                </button>
              );
            })}
          </div>
        )}

        {/* True / False Rendering */}
        {currentQuiz.type === 'true_false' && (
          <div className="mt-6 grid grid-cols-2 gap-4">
            {[true, false].map((val) => {
              const isSelected = selectedAnswers === val;
              const isCorrectVal = String(currentQuiz.answer?.correct).toLowerCase() === String(val).toLowerCase();

              let buttonStyle = 'bg-background hover:bg-muted/10';
              if (isSelected && !isSubmitted) {
                buttonStyle =
                  'border-primary bg-primary/5 text-primary shadow-[4px_4px_0_var(--border)]';
              } else if (isSubmitted) {
                if (isCorrectVal) {
                  buttonStyle =
                    'border-dynamic-green bg-dynamic-green/10 text-dynamic-green shadow-[4px_4px_0_hsl(var(--dynamic-green)/0.2)]';
                } else if (isSelected && !isCorrectVal) {
                  buttonStyle =
                    'border-destructive bg-destructive/10 text-destructive';
                } else {
                  buttonStyle = 'opacity-60';
                }
              }

              return (
                <button
                  key={val ? 'true' : 'false'}
                  onClick={() => handleSelectTrueFalse(val)}
                  disabled={isSubmitted}
                  className={cn(
                    'flex flex-col items-center justify-center border-2 border-border p-6 font-bold shadow-[3px_3px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--border)] active:translate-y-0 disabled:hover:translate-y-0 disabled:hover:shadow-[3px_3px_0_var(--border)]',
                    buttonStyle
                  )}
                  type="button"
                >
                  <span className="text-lg">{val ? 'True' : 'False'}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Matching/Ordering (Unsupported interactivity warning, simple display + correct option check) */}
        {(currentQuiz.type === 'matching' ||
          currentQuiz.type === 'ordering') && (
          <div className="mt-6 space-y-4">
            <div className="flex gap-2 rounded-sm border-2 border-dynamic-yellow/30 bg-dynamic-yellow/10 p-3 text-dynamic-yellow text-xs">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>
                Interactive matching/ordering practice is ready. Please confirm
                correct completion!
              </span>
            </div>

            {currentQuiz.type === 'matching' && (
              <div className="grid gap-2">
                {currentQuiz.content?.pairs?.map((pair: any, pidx: number) => (
                  <div
                    key={pidx}
                    className="flex items-center justify-between border-2 border-border bg-muted/20 p-3 text-sm shadow-[2px_2px_0_var(--border)]"
                  >
                    <span className="font-bold">{pair.left}</span>
                    <span className="text-muted-foreground">⇄</span>
                    <span className="font-bold text-dynamic-green">
                      {pair.right}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {currentQuiz.type === 'ordering' && (
              <div className="grid gap-2">
                {currentQuiz.content?.items?.map(
                  (item: string, iidx: number) => (
                    <div
                      key={iidx}
                      className="flex items-center gap-3 border-2 border-border bg-muted/20 p-3 text-sm shadow-[2px_2px_0_var(--border)]"
                    >
                      <span className="flex h-5 w-5 items-center justify-center border-2 border-border bg-primary font-black text-[10px] text-primary-foreground">
                        {iidx + 1}
                      </span>
                      <span className="font-bold">{item}</span>
                    </div>
                  )
                )}
              </div>
            )}

            <div className="mt-4 flex items-center justify-center">
              <button
                onClick={() => setSelectedAnswers(true)}
                disabled={isSubmitted}
                className={cn(
                  'border-2 border-border px-6 py-2.5 font-black text-sm shadow-[3px_3px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--border)] active:translate-y-0',
                  selectedAnswers === true
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background hover:bg-muted/10'
                )}
                type="button"
              >
                I understand and solved this quiz
              </button>
            </div>
          </div>
        )}

        {/* Explanation display block */}
        {isSubmitted && (
          <div
            className={cn(
              'mt-6 border-2 border-border p-4 shadow-[3px_3px_0_var(--border)]',
              isAnswerCorrect
                ? 'bg-dynamic-green/10 text-dynamic-green'
                : 'bg-destructive/10 text-destructive'
            )}
          >
            <div className="flex items-center gap-2 font-black">
              {isAnswerCorrect ? (
                <>
                  <Check className="h-5 w-5" />
                  <span>Correct!</span>
                </>
              ) : (
                <>
                  <X className="h-5 w-5" />
                  <span>Incorrect</span>
                </>
              )}
            </div>
            {currentQuiz.explanation && (
              <p className="mt-2 text-foreground/80 text-sm leading-relaxed">
                <span className="font-bold text-foreground">Explanation:</span>{' '}
                {currentQuiz.explanation}
              </p>
            )}
          </div>
        )}

        {/* Action Controls */}
        <div className="mt-6 flex items-center justify-end">
          {!isSubmitted ? (
            <Button
              onClick={handleSubmit}
              disabled={selectedAnswers === null}
              className="h-12 border-2 border-border bg-primary font-black text-primary-foreground shadow-[3px_3px_0_var(--border)] hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-[4px_4px_0_var(--border)] active:translate-y-0 active:shadow-[3px_3px_0_var(--border)] disabled:opacity-50"
            >
              Submit Answer
            </Button>
          ) : (
            <Button
              onClick={handleNext}
              className="h-12 border-2 border-border bg-dynamic-green font-black text-dynamic-green-foreground shadow-[3px_3px_0_var(--border)] hover:-translate-y-0.5 hover:bg-dynamic-green/90 hover:shadow-[4px_4px_0_var(--border)] active:translate-y-0 active:shadow-[3px_3px_0_var(--border)]"
            >
              {currentIdx + 1 < quizzes.length
                ? 'Next Question'
                : 'Finish Practice'}
            </Button>
          )}
        </div>
      </BrutalCard>
    </div>
  );
}
