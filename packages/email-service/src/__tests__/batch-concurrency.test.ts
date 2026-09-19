import { describe, expect, it, vi } from 'vitest';
import { createBatch, EmailBatch } from '../batch';

vi.mock('../builder', () => ({ email: vi.fn() }));

describe('email batch concurrency', () => {
  it.each([
    0,
    -1,
    0.5,
    1.5,
    Number.NaN,
    Infinity,
    -Infinity,
    Number.MAX_SAFE_INTEGER + 1,
  ])(
    'rejects a chunk step that cannot safely consume each item: %s',
    (concurrency) => {
      expect(() => new EmailBatch('workspace', { concurrency })).toThrow(
        RangeError
      );
      expect(() => createBatch('workspace', { concurrency })).toThrow(
        RangeError
      );
    }
  );

  it.each([undefined, 1, 5, 10])(
    'accepts valid concurrency: %s',
    (concurrency) => {
      expect(new EmailBatch('workspace', { concurrency }).size).toBe(0);
    }
  );
});
