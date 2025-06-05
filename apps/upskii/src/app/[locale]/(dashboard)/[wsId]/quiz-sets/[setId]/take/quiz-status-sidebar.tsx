import { useCallback } from 'react';

const onQuestionJump = (questionIndex: number) => {
  const element = document.getElementById(`question-${questionIndex}`); // or use questionId
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    element.focus(); // Optional: set focus to the question
  }
};
// ─── TYPES ─────────────────────────────────────────────────────────────────────

type Option = {
  id: string;
  value: string;
};

export type Question = {
  quizId: string;
  question: string;
  score: number;
  options: Option[];
};

interface QuizStatusSidebarProps {
  questions: Question[];
  selectedAnswers: Record<string, string>;
  t: (key: string, options?: Record<string, any>) => string;
}

const QuizStatusSidebar = ({
  questions,
  selectedAnswers,
  t,
}: QuizStatusSidebarProps) => {
  const answeredCount = questions.reduce((count, q) => {
    return selectedAnswers[q.quizId] ? count + 1 : count;
  }, 0);

  // Fallback for t function if not provided or key is missing
  const translate = useCallback(
    (key: string, defaultText: string, options: Record<string, any> = {}) => {
      if (typeof t === 'function') {
        const translation = t(key, options);
        // i18next might return the key if not found, so check against that too
        return translation === key ? defaultText : translation || defaultText;
      }
      return defaultText;
    },
    [t]
  );

  return (
    <aside className="bg-card text-card-foreground h-fit max-h-96 w-full rounded-lg border p-4 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold">
        {translate('ws-quizzes.question_status_title', 'Question Progress')}
      </h2>

      {/* Optional Progress Overview */}
      <div className="mb-4">
        <p className="text-muted-foreground mb-1 text-sm">
          {answeredCount} / {questions.length}{' '}
          {translate('ws-quizzes.answered_status_short', 'answered')}
        </p>
        <div className="bg-muted h-2 w-full rounded-full">
          <div
            className="bg-primary h-2 rounded-full transition-all duration-300 ease-out"
            style={{
              width: `${questions.length > 0 ? (answeredCount / questions.length) * 100 : 0}%`,
            }}
            aria-valuenow={answeredCount}
            aria-valuemin={0}
            aria-valuemax={questions.length}
            role="progressbar"
            aria-label={translate(
              'ws-quizzes.quiz_progress_label',
              'Quiz Progress'
            )}
          ></div>
        </div>
      </div>

      <div
        className="grid grid-cols-5 gap-2 md:grid-cols-6 lg:grid-cols-4 xl:grid-cols-5"
        role="navigation"
        aria-label={translate(
          'ws-quizzes.question_navigation_label',
          'Question Navigation'
        )}
      >
        {questions.map((q, idx) => {
          const isAnswered = Boolean(selectedAnswers[q.quizId]);
          const questionNumber = idx + 1;

          return (
            <button
              key={q.quizId}
              onClick={() => onQuestionJump(idx)} // Pass index or ID
              aria-label={translate(
                'ws-quizzes.jump_to_question_aria',
                `Question ${questionNumber}, ${isAnswered ? translate('ws-quizzes.answered_state', 'Answered') : translate('ws-quizzes.unanswered_state', 'Unanswered')}`,
                { number: questionNumber }
              )}
              className={`focus-visible:ring-ring focus-visible:ring-offset-card flex h-9 w-full items-center justify-center rounded-md border text-xs font-medium transition-all duration-150 ease-in-out hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:opacity-60 ${
                isAnswered
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background hover:bg-muted text-muted-foreground'
              } `}
            >
              <span className="mr-0.5" aria-hidden="true">
                {' '}
                {/* Icon is decorative if main label is sufficient */}
                {isAnswered
                  ? translate('ws-quizzes.answered_icon', '✓')
                  : translate('ws-quizzes.unanswered_icon', '⚪')}
              </span>
              {questionNumber}
            </button>
          );
        })}
      </div>
    </aside>
  );
};

export default QuizStatusSidebar;
