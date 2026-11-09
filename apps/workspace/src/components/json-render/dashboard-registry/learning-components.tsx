'use client';

import {
  ChevronLeft,
  ChevronRight,
  Dices,
  Lightbulb,
  Maximize2,
  PartyPopper,
  RotateCcw,
} from '@tuturuuu/icons';
import type {
  JsonRenderComponentContext,
  JsonRenderFlashcardProps,
  JsonRenderMultiFlashcardProps,
  JsonRenderMultiQuizProps,
  JsonRenderQuizProps,
} from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { useMemo, useState } from 'react';
import { FullscreenLearningDialog, QuizOptionList } from './learning-shared';
import { shuffleArray } from './learning-utils';

type LearningQuizProps = JsonRenderQuizProps;
type LearningMultiQuizProps = JsonRenderMultiQuizProps;
type LearningMultiFlashcardProps = JsonRenderMultiFlashcardProps;

export const dashboardLearningComponents = {
  Flashcard: ({
    props,
  }: JsonRenderComponentContext<JsonRenderFlashcardProps>) => {
    const [flipped, setFlipped] = useState(false);

    return (
      <Card
        className="relative my-4 flex min-h-40 cursor-pointer select-none items-center justify-center p-8 text-center transition-all hover:bg-card/80"
        onClick={() => setFlipped(!flipped)}
      >
        <div className="absolute top-3 right-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider opacity-50">
          {flipped ? 'Answer' : 'Question'}
        </div>
        <div className="font-medium text-xl">
          {flipped ? String(props.back) : String(props.front)}
        </div>
        <div className="absolute bottom-3 text-muted-foreground text-xs opacity-40">
          Click to flip
        </div>
      </Card>
    );
  },

  Quiz: ({ props }: JsonRenderComponentContext<LearningQuizProps>) => {
    const [selected, setSelected] = useState<string | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [randomizeCount, setRandomizeCount] = useState(0);

    const options = useMemo(() => {
      const original = props.options || [];
      if (!props.randomize && randomizeCount === 0) return original;
      return shuffleArray(original);
    }, [props.options, props.randomize, randomizeCount]);

    const answer = String(props.answer || props.correctAnswer || '');
    const isCorrect = selected === answer;

    const quizContent = (
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold text-lg leading-tight">
            {String(props.question)}
          </h3>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                setRandomizeCount((prev) => prev + 1);
                setSelected(null);
              }}
              title="Randomize options"
            >
              <Dices className="h-4 w-4" />
            </Button>
            {!isFullscreen && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setIsFullscreen(true)}
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        <QuizOptionList
          options={options}
          selected={selected}
          answer={answer}
          isCorrect={isCorrect}
          onSelect={setSelected}
        />
        {selected !== null && (
          <div
            className={`mt-2 rounded-lg p-5 ${
              isCorrect
                ? 'bg-dynamic-green/10 text-dynamic-green'
                : 'bg-dynamic-red/10 text-dynamic-red'
            }`}
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="flex items-center gap-2 font-bold text-lg">
                {isCorrect ? (
                  <>
                    <PartyPopper className="h-5 w-5" aria-hidden="true" />
                    <span>Correct!</span>
                  </>
                ) : (
                  <>
                    <Lightbulb className="h-5 w-5" aria-hidden="true" />
                    <span>Incorrect</span>
                  </>
                )}
              </p>
              <Button
                size="sm"
                variant="ghost"
                className={
                  isCorrect
                    ? 'hover:bg-dynamic-green/20 hover:text-dynamic-green'
                    : 'hover:bg-dynamic-red/20 hover:text-dynamic-red'
                }
                onClick={() => setSelected(null)}
              >
                <RotateCcw className="mr-2 h-4 w-4" /> Try Again
              </Button>
            </div>
            {props.explanation && (
              <p className="mt-3 border-current/10 border-t pt-3 text-sm leading-relaxed opacity-90">
                {String(props.explanation)}
              </p>
            )}
          </div>
        )}
      </div>
    );

    if (isFullscreen) {
      return (
        <FullscreenLearningDialog
          open={isFullscreen}
          onOpenChange={setIsFullscreen}
          title="Quiz Immersion"
        >
          {quizContent}
        </FullscreenLearningDialog>
      );
    }

    return (
      <div className="my-4 flex flex-col gap-5 rounded-xl border bg-card p-6 shadow-sm">
        {quizContent}
      </div>
    );
  },

  MultiQuiz: ({
    props,
  }: JsonRenderComponentContext<LearningMultiQuizProps>) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<number, string>>({});
    const [showScore, setShowScore] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [quizRandomizeCount, setQuizRandomizeCount] = useState(0);
    const [optionRandomizeCount, setOptionRandomizeCount] = useState(0);

    const quizzes = useMemo(() => {
      const original = Array.isArray(props.quizzes) ? props.quizzes : [];
      if (!props.randomize && quizRandomizeCount === 0) return original;
      return shuffleArray(original);
    }, [props.quizzes, props.randomize, quizRandomizeCount]);

    const currentQuiz = quizzes[currentIndex];

    const options = useMemo(() => {
      if (!currentQuiz) return [];
      const original = currentQuiz.options || [];
      if (
        !currentQuiz.randomizeOptions &&
        !props.randomize &&
        optionRandomizeCount === 0
      )
        return original;
      return shuffleArray(original);
    }, [currentQuiz, props.randomize, optionRandomizeCount]);

    if (!currentQuiz && !showScore) return null;

    const handleSelect = (option: string) => {
      setAnswers((prev) => ({ ...prev, [currentIndex]: option }));
    };

    const calculateScore = () => {
      let score = 0;
      for (let i = 0; i < quizzes.length; i++) {
        const quiz = quizzes[i];
        if (!quiz) continue;
        const currentAnswer = quiz.answer || quiz.correctAnswer;
        if (currentAnswer && answers[i] === currentAnswer) {
          score++;
        }
      }
      return score;
    };

    if (showScore) {
      const score = calculateScore();
      const scoreContent = (
        <div className="flex flex-col items-center gap-6 text-center">
          <div>
            <h3 className="mb-2 font-bold text-2xl tracking-tight">
              Quiz Results
            </h3>
            <p className="text-muted-foreground">
              You completed the {props.title || 'quiz session'}!
            </p>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="font-black text-6xl text-primary">
              {score} / {quizzes.length}
            </div>
            <p className="font-semibold text-lg opacity-80">
              {Math.round((score / quizzes.length) * 100)}%
            </p>
          </div>
          <div className="flex flex-col items-center gap-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setCurrentIndex(0);
                setAnswers({});
                setShowScore(false);
              }}
            >
              <RotateCcw className="mr-2 h-4 w-4" /> Restart Quiz
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => {
                setQuizRandomizeCount((prev) => prev + 1);
                setOptionRandomizeCount((prev) => prev + 1);
                setAnswers({});
                setCurrentIndex(0);
                setShowScore(false);
              }}
            >
              <Dices className="mr-2 h-4 w-4" /> Randomize & Restart
            </Button>
          </div>
        </div>
      );

      if (isFullscreen) {
        return (
          <FullscreenLearningDialog
            open={isFullscreen}
            onOpenChange={setIsFullscreen}
            title="Quiz Immersion"
            contentClassName="max-w-2xl gap-4 p-10 sm:p-12"
          >
            {scoreContent}
          </FullscreenLearningDialog>
        );
      }

      return (
        <div className="my-4 flex flex-col items-center gap-6 rounded-xl border bg-card p-8 text-center shadow-sm">
          {scoreContent}
        </div>
      );
    }

    if (!currentQuiz) return null;

    const selected = answers[currentIndex];
    const isAnswered = selected !== undefined;
    const isCorrect =
      selected === (currentQuiz.answer || currentQuiz.correctAnswer);

    const quizContent = (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between border-border/40 border-b pb-4">
          <div className="flex flex-col gap-1">
            <h3 className="font-bold text-lg leading-tight">
              {props.title || 'Quiz'}
            </h3>
            <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
              Question {currentIndex + 1} of {quizzes.length}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden h-2 w-24 overflow-hidden rounded-full bg-secondary sm:block">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{
                  width: `${((currentIndex + 1) / quizzes.length) * 100}%`,
                }}
              />
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  setQuizRandomizeCount((prev) => prev + 1);
                  setOptionRandomizeCount((prev) => prev + 1);
                  setAnswers({});
                  setCurrentIndex(0);
                }}
                title="Randomize everything"
              >
                <Dices className="h-4 w-4" />
              </Button>
              {!isFullscreen && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setIsFullscreen(true)}
                >
                  <Maximize2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <h4 className="font-semibold text-xl leading-snug">
            {currentQuiz.question}
          </h4>
          <QuizOptionList
            options={options}
            selected={selected ?? null}
            answer={String(
              currentQuiz.answer || currentQuiz.correctAnswer || ''
            )}
            isCorrect={isCorrect}
            onSelect={handleSelect}
            unansweredExtraClassName="bg-secondary/40"
            optionLabelClassName="flex-1 font-medium"
          />

          {isAnswered && currentQuiz.explanation && (
            <div
              className={`mt-2 rounded-lg p-5 ${
                isCorrect
                  ? 'bg-dynamic-green/10 text-dynamic-green'
                  : 'bg-dynamic-red/10 text-dynamic-red'
              }`}
            >
              <p className="mb-1 flex items-center gap-2 font-bold">
                {isCorrect ? (
                  <>
                    <PartyPopper className="h-5 w-5" aria-hidden="true" />
                    <span>Correct!</span>
                  </>
                ) : (
                  <>
                    <Lightbulb className="h-5 w-5" aria-hidden="true" />
                    <span>Incorrect</span>
                  </>
                )}
              </p>
              <p className="text-sm leading-relaxed opacity-90">
                {currentQuiz.explanation}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-border/40 border-t pt-5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
            disabled={currentIndex === 0}
          >
            Previous
          </Button>
          {currentIndex === quizzes.length - 1 ? (
            <Button
              size="sm"
              disabled={!isAnswered}
              onClick={() => setShowScore(true)}
              className="bg-primary hover:bg-primary/90"
            >
              Finish Quiz
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={!isAnswered}
              onClick={() => setCurrentIndex(currentIndex + 1)}
            >
              Next Question
            </Button>
          )}
        </div>
      </div>
    );

    if (isFullscreen) {
      return (
        <FullscreenLearningDialog
          open={isFullscreen}
          onOpenChange={setIsFullscreen}
          title="Quiz Immersion"
        >
          {quizContent}
        </FullscreenLearningDialog>
      );
    }

    return (
      <div className="my-4 flex flex-col gap-6 rounded-xl border bg-card p-6 shadow-sm">
        {quizContent}
      </div>
    );
  },

  MultiFlashcard: ({
    props,
  }: JsonRenderComponentContext<LearningMultiFlashcardProps>) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [flipped, setFlipped] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [randomizeCount, setRandomizeCount] = useState(0);

    const flashcards = useMemo(() => {
      const original = props.flashcards || [];
      if (!props.randomize && randomizeCount === 0) return original;
      return shuffleArray(original);
    }, [props.flashcards, props.randomize, randomizeCount]);

    const currentCard = flashcards[currentIndex];

    if (!currentCard) return null;

    const flashcardContent = (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between border-border/40 border-b pb-4">
          <div className="flex flex-col gap-1">
            <h3 className="font-bold text-lg leading-tight">
              {props.title || 'Flashcards'}
            </h3>
            <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
              Card {currentIndex + 1} of {flashcards.length}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden h-2 w-24 overflow-hidden rounded-full bg-secondary/60 sm:block">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{
                  width: `${((currentIndex + 1) / flashcards.length) * 100}%`,
                }}
              />
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  setRandomizeCount((prev) => prev + 1);
                  setFlipped(false);
                  setCurrentIndex(0);
                }}
                title="Randomize cards"
              >
                <Dices className="h-4 w-4" />
              </Button>
              {!isFullscreen && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setIsFullscreen(true)}
                >
                  <Maximize2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>

        <div
          className={`transform-3d relative flex min-h-62.5 cursor-pointer select-none items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-500 ${
            flipped
              ? 'transform-[rotateY(180deg)] border-primary/40 bg-primary/5'
              : 'border-border bg-secondary/20 hover:bg-secondary/30'
          }`}
          onClick={() => setFlipped(!flipped)}
        >
          <div
            className={`backface-hidden absolute inset-0 flex flex-col items-center justify-center p-8 ${
              flipped ? 'pointer-events-none opacity-0' : 'opacity-100'
            }`}
          >
            <div className="mb-4 font-semibold text-muted-foreground text-xs uppercase tracking-widest opacity-60">
              Question
            </div>
            <div className="font-bold text-2xl leading-tight">
              {currentCard.front}
            </div>
            <div className="mt-8 text-muted-foreground text-xs opacity-40">
              Click to flip
            </div>
          </div>

          <div
            className={`backface-hidden transform-[rotateY(180deg)] absolute inset-0 flex flex-col items-center justify-center p-8 ${
              flipped ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
          >
            <div className="mb-4 font-semibold text-muted-foreground text-xs uppercase tracking-widest opacity-60">
              Answer
            </div>
            <div className="font-bold text-2xl leading-tight">
              {currentCard.back}
            </div>
            <div className="mt-8 text-muted-foreground text-xs opacity-40">
              Click to flip
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-border/40 border-t pt-5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setCurrentIndex(Math.max(0, currentIndex - 1));
              setFlipped(false);
            }}
            disabled={currentIndex === 0}
          >
            <ChevronLeft className="mr-2 h-4 w-4" /> Previous
          </Button>
          <div className="flex gap-2">
            {currentIndex === flashcards.length - 1 ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setCurrentIndex(0);
                    setFlipped(false);
                  }}
                >
                  <RotateCcw className="mr-2 h-4 w-4" /> Restart
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setRandomizeCount((prev) => prev + 1);
                    setFlipped(false);
                    setCurrentIndex(0);
                  }}
                >
                  <Dices className="mr-2 h-4 w-4" /> Randomize
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                onClick={() => {
                  setCurrentIndex(currentIndex + 1);
                  setFlipped(false);
                }}
              >
                Next <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    );

    if (isFullscreen) {
      return (
        <FullscreenLearningDialog
          open={isFullscreen}
          onOpenChange={setIsFullscreen}
          title="Flashcard Immersion"
        >
          {flashcardContent}
        </FullscreenLearningDialog>
      );
    }

    return (
      <div className="my-4 flex flex-col gap-6 rounded-xl border bg-card p-6 shadow-sm">
        {flashcardContent}
      </div>
    );
  },
};
