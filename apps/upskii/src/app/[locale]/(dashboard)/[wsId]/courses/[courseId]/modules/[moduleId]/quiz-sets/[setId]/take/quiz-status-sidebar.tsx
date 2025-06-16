'use client';

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
  t: (key: string, options?: Record<string, any>) => string;
}

export default function QuizStatusSidebar({
  questions,
  selectedAnswers,
  t,
}: QuizStatusSidebarProps) {
  // Count how many questions have at least one selected answer
  const answeredCount = questions.reduce((count, q) => {
    const sel = selectedAnswers[q.quizId];
    if (Array.isArray(sel) ? sel.length > 0 : Boolean(sel)) {
      return count + 1;
    }
    return count;
  }, 0);

  // Translation helper (falls back to defaultText if t(key) === key)
  const translate = useCallback(
    (key: string, defaultText: string, options: Record<string, any> = {}) => {
      const msg = t(key, options);
      return msg === key ? defaultText : msg;
    },
    [t]
  );

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
      aria-label={translate(
        'ws-quizzes.sidebar_aria',
        'Quiz progress navigation'
      )}
    >
      <h2 className="mb-4 text-lg font-semibold">
        {translate('ws-quizzes.question_status_title', 'Question Progress')}
      </h2>

      {/* Progress overview */}
      <div className="mb-4">
        <p className="mb-1 text-sm text-muted-foreground">
          {answeredCount} / {questions.length}{' '}
          {translate('ws-quizzes.answered_status_short', 'answered')}
        </p>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-2 rounded-full bg-primary transition-all duration-300 ease-out"
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={answeredCount}
            aria-valuemin={0}
            aria-valuemax={questions.length}
            aria-label={translate(
              'ws-quizzes.quiz_progress_label',
              'Quiz Progress'
            )}
          />
        </div>
      </div>

      {/* Question jump grid */}
      <nav
        className="grid grid-cols-5 gap-2 md:grid-cols-6 lg:grid-cols-4 xl:grid-cols-5"
        aria-label={translate(
          'ws-quizzes.question_navigation_label',
          'Jump to question'
        )}
      >
        {questions.map((q, idx) => {
          const answered = Array.isArray(selectedAnswers[q.quizId])
            ? (selectedAnswers[q.quizId] as string[]).length > 0
            : Boolean(selectedAnswers[q.quizId]);
          const labelText = answered
            ? translate('ws-quizzes.answered_state', 'Answered')
            : translate('ws-quizzes.unanswered_state', 'Unanswered');
          const icon = answered
            ? translate('ws-quizzes.answered_icon', '✓')
            : translate('ws-quizzes.unanswered_icon', '○');

          return (
            <button
              key={q.quizId}
              onClick={() => onQuestionJump(idx)}
              aria-label={`${translate(
                'ws-quizzes.jump_to_question',
                'Jump to question',
                { number: idx + 1 }
              )} ${idx + 1}, ${labelText}`}
              className={
                `flex h-9 w-full items-center justify-center rounded-md border text-xs font-medium transition ` +
                (answered
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground hover:bg-muted')
              }
            >
              <span className="mr-1" aria-hidden="true">
                {icon}
              </span>
              {idx + 1}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
