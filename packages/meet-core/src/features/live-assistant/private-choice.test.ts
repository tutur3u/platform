import { expect, it } from 'vitest';
import {
  confirmPrivateChoice,
  PrivateChoiceError,
  privateChoiceProblem,
} from './private-choice';

it('maps room-service rejections to the presence and stop reasons the notice names', () => {
  expect(privateChoiceProblem({ status: 403 })).toBe('not_admitted');
  expect(privateChoiceProblem({ status: 409 })).toBe('busy');
  expect(privateChoiceProblem({ status: 500 })).toBe('failed');
  expect(privateChoiceProblem(new TypeError('Failed to fetch'))).toBe('failed');
  expect(privateChoiceProblem(new PrivateChoiceError('timeout'))).toBe(
    'timeout'
  );
});

it('admits only a confirmed Continue on an available policy', () => {
  expect(
    confirmPrivateChoice(
      { available: true, choice: { choice: 'continue' } as never },
      'continue'
    )
  ).toBe(true);
  expect(
    confirmPrivateChoice(
      { available: true, choice: { choice: 'mute' } as never },
      'mute'
    )
  ).toBe(false);
  for (const [policy, requested, problem] of [
    [{ available: true, choice: null }, 'continue', 'unconfirmed'],
    [
      { available: true, choice: { choice: 'mute' } as never },
      'continue',
      'unconfirmed',
    ],
    [
      { available: false, choice: { choice: 'continue' } as never },
      'continue',
      'unavailable',
    ],
  ] as const) {
    let thrown: unknown;
    try {
      confirmPrivateChoice(policy, requested);
    } catch (error) {
      thrown = error;
    }
    expect(privateChoiceProblem(thrown)).toBe(problem);
  }
});
