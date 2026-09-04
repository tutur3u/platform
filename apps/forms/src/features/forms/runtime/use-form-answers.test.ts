import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FormAnswerValue } from '../types';
import { useFormAnswers } from './use-form-answers';

function setup(onAnswered = vi.fn()) {
  const result = renderHook(() =>
    useFormAnswers({
      initialAnswers: {},
      onAnswered,
      setError: () => {},
      setValidationErrorsByQuestionId: () => {},
    })
  );

  return { ...result, onAnswered };
}

describe('useFormAnswers', () => {
  it('exposes the answer through both state and the ref', () => {
    const { result } = setup();

    act(() => {
      result.current.updateAnswer('q1', 'alpha');
    });

    expect(result.current.answers.q1).toBe('alpha');
    expect(result.current.answersRef.current.q1).toBe('alpha');
  });

  it('has the ref current before onAnswered runs', () => {
    // The regression this guards: `setAnswers` used to update the ref inside
    // the state updater, which React runs later. `onAnswered` triggers
    // auto-advance, and auto-advance validates against the ref — so the answer
    // just given still looked missing and the advance was refused.
    const seen: Array<FormAnswerValue | undefined> = [];
    const { result } = setup(
      vi.fn(() => {
        seen.push(result.current.answersRef.current.q1);
      })
    );

    act(() => {
      result.current.updateAnswer('q1', 'alpha');
    });

    expect(seen).toEqual(['alpha']);
  });

  it('keeps the ref in step when set through the updater form', () => {
    // `useFormDraft` restores a saved draft this way.
    const { result } = setup();

    act(() => {
      result.current.setAnswers((previous) => ({ ...previous, q2: 'beta' }));
    });

    expect(result.current.answersRef.current.q2).toBe('beta');
    expect(result.current.answers.q2).toBe('beta');
  });

  it('composes concurrent updater functions instead of overwriting them', () => {
    // Replacing queued updaters with direct values would lose the first write.
    const { result } = setup();

    act(() => {
      result.current.setAnswers((previous) => ({ ...previous, a: '1' }));
      result.current.setAnswers((previous) => ({ ...previous, b: '2' }));
    });

    expect(result.current.answers).toMatchObject({ a: '1', b: '2' });
    expect(result.current.answersRef.current).toMatchObject({ a: '1', b: '2' });
  });
});
