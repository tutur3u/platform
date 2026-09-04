'use client';

import { useCallback, useRef } from 'react';
import type { FormAnswerValue } from '../types';
import type { FormStep } from './step-plan';
import { useFormKeyboard } from './use-form-keyboard';

export interface RuntimeKeyboardHandlers {
  next: () => void;
  previous: () => void;
}

/**
 * Binds the runtime's keyboard navigation.
 *
 * Takes the navigation handlers through a ref rather than as arguments,
 * because `useFormKeyboard` has to be called before the runtime's early return
 * for a form with no current section — a hook after a conditional return runs
 * on some renders and not others, which breaks React's hook order. The handlers
 * are defined further down the component, so the ref is how they get here
 * without moving that return.
 */
export function useRuntimeKeyboard({
  enabled,
  step,
  getAnswer,
  setAnswer,
}: {
  enabled: boolean;
  step: FormStep | undefined;
  getAnswer: (questionId: string) => FormAnswerValue | undefined;
  setAnswer: (questionId: string, value: FormAnswerValue) => void;
}): { handlersRef: React.MutableRefObject<RuntimeKeyboardHandlers> } {
  const handlersRef = useRef<RuntimeKeyboardHandlers>({
    next: () => {},
    previous: () => {},
  });

  /**
   * The single answerable question on this screen, or null when the screen
   * holds several. Option shortcuts only make sense with exactly one question
   * to apply them to — with two on screen, "press 2" is ambiguous.
   */
  const shortcutQuestionId =
    step?.answerableQuestionIds.length === 1
      ? (step.answerableQuestionIds[0] ?? null)
      : null;
  const shortcutQuestion =
    shortcutQuestionId === null
      ? null
      : (step?.questions.find(
          (question) => question.id === shortcutQuestionId
        ) ?? null);

  const selectOptionByIndex = useCallback(
    (index: number) => {
      if (!shortcutQuestion) return false;

      const type = shortcutQuestion.type;
      const isSingle = type === 'single_choice' || type === 'dropdown';
      const isMultiple = type === 'multiple_choice';
      if (!(isSingle || isMultiple)) return false;

      const option = shortcutQuestion.options[index];
      if (!option) return false;

      if (isMultiple) {
        // Multi-select toggles, so the same key both adds and removes — the
        // only behaviour that lets a keyboard user undo a mistake without
        // reaching for the mouse.
        const current = getAnswer(shortcutQuestion.id);
        const selected = Array.isArray(current) ? current : [];
        const next = selected.includes(option.value)
          ? selected.filter((entry) => entry !== option.value)
          : [...selected, option.value];

        setAnswer(shortcutQuestion.id, next);
        return true;
      }

      setAnswer(shortcutQuestion.id, option.value);
      return true;
    },
    [getAnswer, setAnswer, shortcutQuestion]
  );

  const onNext = useCallback(() => handlersRef.current.next(), []);
  const onPrevious = useCallback(() => handlersRef.current.previous(), []);

  useFormKeyboard({
    enabled,
    onNext,
    onPrevious,
    onSelectOption: selectOptionByIndex,
  });

  return { handlersRef };
}
