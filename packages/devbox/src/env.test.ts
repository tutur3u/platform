import { describe, expect, it } from 'vitest';
import {
  mergeDevboxEnv,
  parseDevboxEnvAssignments,
  redactDevboxSecrets,
} from './env';

describe('devbox env helpers', () => {
  it('parses KEY=value assignments', () => {
    expect(
      parseDevboxEnvAssignments(['A=1', 'DATABASE_URL=postgres://x'])
    ).toEqual({
      A: '1',
      DATABASE_URL: 'postgres://x',
    });
  });

  it('rejects invalid env names', () => {
    expect(() => parseDevboxEnvAssignments(['BAD-NAME=value'])).toThrow(
      'Invalid environment variable name'
    );
  });

  it('merges updates and removals without mutating the input', () => {
    const base = { A: '1', B: '2' };

    expect(
      mergeDevboxEnv(base, { updates: { C: '3' }, removals: ['A'] })
    ).toEqual({
      B: '2',
      C: '3',
    });
    expect(base).toEqual({ A: '1', B: '2' });
  });

  it('redacts non-empty secret values from logs', () => {
    expect(
      redactDevboxSecrets('DATABASE_URL=postgres://secret TOKEN=abc123', {
        DATABASE_URL: 'postgres://secret',
        EMPTY: '',
        TOKEN: 'abc123',
      })
    ).toBe('DATABASE_URL=[REDACTED] TOKEN=[REDACTED]');
  });
});
