'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { FormAnswerValue } from '../types';
import { AUTO_ADVANCE_DELAY_MS, shouldAutoAdvance } from './auto-advance';
import type { FormStep } from './step-plan';

/**
 * Moves on shortly after a single-gesture answer.
 *
 * Picking an option and then reaching for Continue is the click a
 * one-question form exists to remove, so answering is the whole interaction
 * for the types where an answer is complete the moment it is given.
 */
export function useAutoAdvance({
  enabled,
  step,
  onAdvance,
}: {
  enabled: boolean;
  /** The current screen. Both the question type and the count come from it. */
  step: FormStep | undefined;
  onAdvance: () => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onAdvanceRef = useRef(onAdvance);
  onAdvanceRef.current = onAdvance;

  const cancel = useCallback(() => {
    if (!timerRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  // A pending advance must never fire against a screen the respondent has
  // already left, so unmounting cancels it.
  useEffect(() => cancel, [cancel]);

  return useCallback(
    (questionId: string, value: FormAnswerValue) => {
      // Always cancel first: changing a rating three times in a second should
      // advance once, from the last choice, not three times.
      cancel();

      const type = step?.questions.find(
        (entry) => entry.id === questionId
      )?.type;
      if (!type) return;

      if (
        !shouldAutoAdvance({
          answerableCount: step?.answerableQuestionIds.length ?? 0,
          enabled,
          type,
          value,
        })
      ) {
        return;
      }

      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        onAdvanceRef.current();
      }, AUTO_ADVANCE_DELAY_MS);
    },
    [cancel, enabled, step]
  );
}
