'use client';

import { cn } from '@tuturuuu/utils/format';
import type { useTranslations } from 'next-intl';

type MatchingPair = { left: string; right: string };
type QuizOption = {
  explanation?: string | null;
  id: string;
  is_correct?: boolean | null;
  option_index?: number | null;
  value: string | null;
};

export interface QuizSubmissionViewerQuiz {
  answer?: unknown;
  content: unknown;
  id: string;
  question: string | null;
  quiz_options?: QuizOption[];
  score?: number | null;
  type: string | null;
}

export interface QuizSubmissionViewerAnswer {
  answer: unknown;
  is_correct: boolean | null;
  selected_option_id: string | null;
}

type MultipleChoiceOption = {
  id: string;
  index: number | null;
  value: string;
};

function getParsedContent(value: unknown): unknown {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  const parsedValue = getParsedContent(value);
  if (
    !parsedValue ||
    typeof parsedValue !== 'object' ||
    Array.isArray(parsedValue)
  )
    return null;
  return parsedValue as Record<string, unknown>;
}

function displayText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  return '';
}

function getArrayProperty(value: unknown, key: string): unknown[] {
  const property = asRecord(value)?.[key];
  return Array.isArray(property) ? property : [];
}

function getStringItems(value: unknown, key: string): string[] {
  return getArrayProperty(value, key).map(displayText);
}

function getMatchingPairs(value: unknown): MatchingPair[] {
  const parsedValue = getParsedContent(value);
  const pairs = Array.isArray(parsedValue)
    ? parsedValue
    : getArrayProperty(parsedValue, 'pairs');
  return pairs
    .map((pair) => {
      const record = asRecord(pair);
      return {
        left: displayText(record?.left),
        right: displayText(record?.right),
      };
    })
    .filter((pair) => Boolean(pair.left && pair.right));
}

function getSelectedIndexAnswer(value: unknown) {
  const selectedIndex = asRecord(value)?.selectedIndex;
  return typeof selectedIndex === 'number' ? selectedIndex : null;
}

function getCorrectIndexAnswer(value: unknown) {
  const correctIndex = asRecord(value)?.correctIndex;
  return typeof correctIndex === 'number' ? correctIndex : null;
}

function getTrueFalseAnswer(value: unknown) {
  if (typeof value === 'boolean') return value;

  const correct = asRecord(value)?.correct;
  return typeof correct === 'boolean' ? correct : null;
}

function getAnswerOrder(value: unknown) {
  if (Array.isArray(value)) return value.map(displayText).filter(Boolean);
  return getStringItems(value, 'order');
}

function getMultipleChoiceOptions(
  quiz: QuizSubmissionViewerQuiz
): MultipleChoiceOption[] {
  const contentOptions = getArrayProperty(quiz.content, 'options');
  const quizOptionsByIndex = new Map(
    (quiz.quiz_options ?? [])
      .filter((option) => typeof option.option_index === 'number')
      .map((option) => [option.option_index as number, option])
  );

  const parsedContentOptions = contentOptions
    .map((option: unknown, index: number) => ({
      id: quizOptionsByIndex.get(index)?.id ?? `content-${index}`,
      value: displayText(option),
      index,
    }))
    .filter((opt: { id: string; value: string; index: number }) =>
      Boolean(opt.value)
    );

  if (parsedContentOptions.length > 0) {
    return parsedContentOptions;
  }

  return (quiz.quiz_options ?? []).map((option) => ({
    id: option.id,
    value: displayText(option.value),
    index: option.option_index ?? null,
  }));
}

function hasSubmittedAnswer(answer: QuizSubmissionViewerAnswer) {
  if (answer.selected_option_id !== null && answer.selected_option_id !== '') {
    return true;
  }

  return answer.answer !== null && answer.answer !== undefined;
}

function findRawMultipleChoiceOption(
  quiz: QuizSubmissionViewerQuiz,
  opt: MultipleChoiceOption
) {
  const byId = quiz.quiz_options?.find((option) => option.id === opt.id);
  if (byId) return byId;

  return opt.index !== null
    ? quiz.quiz_options?.find((option) => option.option_index === opt.index)
    : null;
}

export function QuizSubmissionResponseViewer({
  quiz,
  answer,
  t,
}: {
  quiz: QuizSubmissionViewerQuiz;
  answer: QuizSubmissionViewerAnswer;
  t: ReturnType<typeof useTranslations>;
}) {
  if (!hasSubmittedAnswer(answer)) {
    return (
      <div className="border-2 border-border bg-background p-3 font-bold text-muted-foreground text-sm">
        {t('teachModules.noAnswerSubmitted')}
      </div>
    );
  }

  const isCorrect = answer.is_correct;

  if (!quiz.type || quiz.type === 'multiple_choice') {
    const options = getMultipleChoiceOptions(quiz);
    const correctIndex = getCorrectIndexAnswer(quiz.answer);
    return (
      <div className="space-y-2">
        <p className="mb-1 font-bold text-muted-foreground text-xs uppercase tracking-wider">
          {t('teachModules.studentChoice')}
        </p>
        {options.map((opt) => {
          const isSelected =
            answer.selected_option_id === opt.id ||
            (opt.index !== null &&
              getSelectedIndexAnswer(answer.answer) === opt.index);

          const rawOpt = findRawMultipleChoiceOption(quiz, opt);
          const isOptionCorrect =
            correctIndex !== null
              ? opt.index !== null && correctIndex === opt.index
              : (rawOpt?.is_correct ?? false);

          let optionStyle = 'border-border bg-background';
          if (isSelected) {
            optionStyle = isCorrect
              ? 'border-dynamic-green bg-dynamic-green/10 text-dynamic-green-foreground'
              : 'border-dynamic-red bg-dynamic-red/10 text-dynamic-red-foreground';
          } else if (isOptionCorrect) {
            optionStyle =
              'border-dynamic-green bg-dynamic-green/5 border-dashed text-dynamic-green-foreground';
          }

          return (
            <div
              key={opt.id}
              className={cn(
                'flex items-center justify-between border-2 p-3 shadow-[1px_1px_0_var(--border)]',
                optionStyle
              )}
            >
              <span className="font-bold text-sm">{opt.value}</span>
              {isSelected && (
                <span className="font-black text-xs uppercase tracking-wider">
                  {isCorrect
                    ? t('teachModules.selectedCorrectAnswer')
                    : t('teachModules.selectedIncorrectAnswer')}
                </span>
              )}
              {!isSelected && isOptionCorrect && (
                <span className="font-bold text-muted-foreground text-xs uppercase tracking-wider">
                  {t('teachModules.correctAnswerLabel')}
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  if (quiz.type === 'true_false') {
    const studentVal = getTrueFalseAnswer(answer.answer);
    const options = [
      { label: t('ws-quizzes.true'), value: true },
      { label: t('ws-quizzes.false'), value: false },
    ];

    return (
      <div className="space-y-2">
        <p className="mb-1 font-bold text-muted-foreground text-xs uppercase tracking-wider">
          {t('teachModules.studentAnswer')}
        </p>
        <div className="grid grid-cols-2 gap-3">
          {options.map((opt) => {
            const isSelected = studentVal === opt.value;
            let optionStyle = 'border-border bg-background';
            if (isSelected) {
              optionStyle = isCorrect
                ? 'border-dynamic-green bg-dynamic-green/10 text-dynamic-green-foreground'
                : 'border-dynamic-red bg-dynamic-red/10 text-dynamic-red-foreground';
            } else if (studentVal !== null && !isSelected && !isCorrect) {
              optionStyle =
                'border-dynamic-green bg-dynamic-green/5 border-dashed text-dynamic-green-foreground';
            }

            return (
              <div
                key={String(opt.value)}
                className={cn(
                  'flex items-center justify-center border-2 py-3 font-bold text-sm shadow-[1px_1px_0_var(--border)]',
                  optionStyle
                )}
              >
                {opt.label}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (quiz.type === 'ordering') {
    const submittedOrder = getAnswerOrder(answer.answer);

    return (
      <div className="space-y-2">
        <p className="mb-1 font-bold text-muted-foreground text-xs uppercase tracking-wider">
          {t('teachModules.studentOrder')}
        </p>
        <div className="space-y-2">
          {submittedOrder.map((item: string, idx: number) => (
            <div
              key={`${item}-${idx}`}
              className={cn(
                'flex items-center gap-3 border-2 p-3 text-sm shadow-[1px_1px_0_var(--border)]',
                isCorrect
                  ? 'border-dynamic-green bg-dynamic-green/10'
                  : 'border-dynamic-red bg-dynamic-red/10'
              )}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center border-2 border-border bg-primary font-black text-[10px] text-primary-foreground">
                {idx + 1}
              </span>
              <span className="font-bold">{item}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (quiz.type === 'matching') {
    const pairs = getMatchingPairs(quiz.content);
    const submittedPairs = getMatchingPairs(answer.answer);

    return (
      <div className="space-y-2">
        <p className="mb-1 font-bold text-muted-foreground text-xs uppercase tracking-wider">
          {t('teachModules.studentMatchings')}
        </p>
        <div className="space-y-2">
          {pairs.map((pair, idx) => {
            const currentRight =
              submittedPairs.find(
                (submittedPair) => submittedPair.left === pair.left
              )?.right || '—';
            return (
              <div
                key={`${pair.left}-${idx}`}
                className={cn(
                  'grid gap-3 border-2 p-3 text-sm shadow-[1px_1px_0_var(--border)] md:grid-cols-[1fr_1fr] md:items-center',
                  isCorrect
                    ? 'border-dynamic-green bg-dynamic-green/10'
                    : 'border-dynamic-red bg-dynamic-red/10'
                )}
              >
                <span className="font-bold">{pair.left}</span>
                <div className="border-2 border-border bg-background p-2 font-bold text-sm">
                  {currentRight}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (quiz.type === 'paragraph') {
    const text = asRecord(answer.answer)?.text;
    const textValue =
      typeof text === 'string' && text.trim()
        ? text
        : t('teachModules.noAnswerSubmitted');
    return (
      <div className="space-y-2">
        <p className="mb-1 font-bold text-muted-foreground text-xs uppercase tracking-wider">
          {t('teachModules.studentResponse')}
        </p>
        <div className="w-full whitespace-pre-wrap border-2 border-border bg-background p-3 font-bold text-sm">
          {textValue}
        </div>
      </div>
    );
  }

  return null;
}
