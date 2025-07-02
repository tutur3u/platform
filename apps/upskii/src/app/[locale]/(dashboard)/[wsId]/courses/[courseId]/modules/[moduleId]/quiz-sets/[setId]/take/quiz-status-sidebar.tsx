'use client';

import { CheckIcon, Circle } from '@tuturuuu/ui/icons';
import { useTranslations } from 'next-intl';
import React, { useCallback } from 'react';

export type Question = {
  quizId: string;
  question: string;
  score: number;
  options: { id: string; value: string }[];
};

interface QuizStatusSidebarProps {
  questions: Question[];
  selectedAnswers: Record<string, string | string[]>;
}

export default function QuizStatusSidebar({
  questions,
  selectedAnswers,
}: QuizStatusSidebarProps) {
  const t = useTranslations('ws-quizzes.quiz-status');
  // Count how many questions have at least one selected answer
  const answeredCount = questions.reduce((count, q) => {
    const sel = selectedAnswers[q.quizId];
    if (Array.isArray(sel) ? sel.length > 0 : Boolean(sel)) {
      return count + 1;
    }
    return count;
  }, 0);

  // Scroll smoothly to the question container
  const onQuestionJump = useCallback((idx: number) => {
    const el = document.getElementById(`quiz-${idx}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.focus();
    }
  }, []);

  const pct = questions.length
    ? Math.round((answeredCount / questions.length) * 100)
    : 0;

  return (
    <aside
      className="h-fit max-h-96 w-full rounded-lg border bg-card p-4 text-card-foreground shadow-sm"
      aria-label={t('sidebar_aria')}
    >
      <h2 className="mb-4 font-semibold text-lg">
        {t('question_status_title')}
      </h2>

      {/* Progress overview */}
      <div className="mb-4">
        <p className="mb-1 text-muted-foreground text-sm">
          {answeredCount} / {questions.length} {t('answered_status_short')}
        </p>
        <div className="h-2 w-full overflow-hidden rounded-full bg-dynamic-purple/20">
          <div
            className="h-2 rounded-full bg-gradient-to-r from-dynamic-purple/30 to-dynamic-light-purple transition-all duration-300 ease-out"
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={answeredCount}
            aria-valuemin={0}
            aria-valuemax={questions.length}
            aria-label={t('quiz_progress_label')}
          />
        </div>
      </div>

      {/* Question jump grid */}
      <nav
        className="grid grid-cols-5 gap-2 md:grid-cols-6 lg:grid-cols-4 xl:grid-cols-5"
        aria-label={t('question_navigation_label')}
      >
        {questions.map((q, idx) => {
          const answered = Array.isArray(selectedAnswers[q.quizId])
            ? (selectedAnswers[q.quizId] as string[]).length > 0
            : Boolean(selectedAnswers[q.quizId]);
          const labelText = answered
            ? t('answered_state')
            : t('unanswered_state');

          return (
            <button
              key={q.quizId}
              onClick={() => onQuestionJump(idx)}
              aria-label={`${t('jump_to_question')} ${idx + 1}, ${labelText}`}
              className={
                `flex h-9 w-full items-center justify-center rounded-md border font-medium text-xs transition ` +
                (answered
                  ? 'border-primary/40 bg-dynamic-purple/25 text-primary'
                  : 'border-border bg-background text-muted-foreground hover:bg-muted')
              }
            >
              {/* <span className="mr-1 text-lg" aria-hidden="true">
                {icon}
              </span> */}
              {answered ? (
                <CheckIcon
                  className="mr-1 h-4 w-4 text-dynamic-light-purple"
                  strokeWidth={4}
                />
              ) : (
                <Circle
                  className="mr-1 h-4 w-4 text-muted-foreground"
                  strokeWidth={2.5}
                />
              )}
              {idx + 1}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
