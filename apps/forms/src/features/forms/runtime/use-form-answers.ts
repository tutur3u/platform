'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useRef, useState } from 'react';
import type { FormAnswerValue } from '../types';

export interface FormAnswersState {
  answers: Record<string, FormAnswerValue>;
  /**
   * The same answers, readable synchronously.
   *
   * Validation and submission run inside handlers that may fire in the same
   * tick as an edit, and `answers` would still be the pre-edit render's copy —
   * so the ref is what those read, and the state is what renders.
   */
  answersRef: React.MutableRefObject<Record<string, FormAnswerValue>>;
  /**
   * Kept as a `Dispatch` rather than a plain setter: `useFormDraft` restores a
   * saved draft through it and expects React's own signature, and narrowing it
   * here would push a cast onto that caller instead.
   */
  setAnswers: Dispatch<SetStateAction<Record<string, FormAnswerValue>>>;
  /** Records one answer and clears any error it was carrying. */
  updateAnswer: (questionId: string, value: FormAnswerValue) => void;
}

export function useFormAnswers({
  initialAnswers,
  onAnswered,
  setError,
  setValidationErrorsByQuestionId,
}: {
  initialAnswers: Record<string, FormAnswerValue>;
  /** Fired after the answer lands, so the caller can react to it. */
  onAnswered: (questionId: string, value: FormAnswerValue) => void;
  setError: (error: string | null) => void;
  setValidationErrorsByQuestionId: Dispatch<
    SetStateAction<Record<string, string>>
  >;
}): FormAnswersState {
  const [answers, setAnswersState] = useState(initialAnswers);
  const answersRef = useRef(initialAnswers);

  const setAnswers = useCallback<
    Dispatch<SetStateAction<Record<string, FormAnswerValue>>>
  >((update) => {
    // A direct value updates the ref BEFORE scheduling the state change.
    // `updateAnswer` calls `onAnswered` in the same tick, and auto-advance
    // validates against `answersRef` — reading it after only queueing the
    // update would see the answer that was just given as still missing.
    if (typeof update !== 'function') {
      answersRef.current = update;
      setAnswersState(update);
      return;
    }

    // The functional form has to stay queued so concurrent updaters compose
    // instead of overwriting each other; the ref catches up inside it.
    setAnswersState((previous) => {
      const next = update(previous);
      answersRef.current = next;
      return next;
    });
  }, []);

  const updateAnswer = useCallback(
    (questionId: string, value: FormAnswerValue) => {
      setAnswers({ ...answersRef.current, [questionId]: value });
      // Answering is the respondent addressing the complaint, so the complaint
      // goes as soon as they do — leaving it up until the next advance reads as
      // the form not noticing.
      setError(null);
      setValidationErrorsByQuestionId((previous) => {
        if (!(questionId in previous)) return previous;
        const next = { ...previous };
        delete next[questionId];
        return next;
      });
      onAnswered(questionId, value);
    },
    [onAnswered, setAnswers, setError, setValidationErrorsByQuestionId]
  );

  return { answers, answersRef, setAnswers, updateAnswer };
}
