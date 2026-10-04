import { describe, expect, it } from 'vitest';
import {
  sandboxProcessArgs,
  sandboxProcessBudget,
} from './devbox-sandbox-pids';

describe('gVisor process budgets', () => {
  it.each([16, 32, 64, 256])(
    'retains guest limit %i with bounded runtime overhead',
    (guestTasks) => {
      expect(sandboxProcessBudget(guestTasks)).toEqual({
        guestTasks,
        hostTasks: guestTasks + 128,
      });
      expect(sandboxProcessArgs(guestTasks)).toEqual([
        `--pids-limit=${guestTasks + 128}`,
        `--ulimit=nproc=${guestTasks}:${guestTasks}`,
      ]);
    }
  );
  it.each([
    0,
    15,
    257,
    1000000,
    -1,
    32.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])('rejects malformed or oversized guest budget %s', (value) => {
    expect(() => sandboxProcessArgs(value)).toThrow(
      'Invalid sandbox guest process limit'
    );
  });
});
