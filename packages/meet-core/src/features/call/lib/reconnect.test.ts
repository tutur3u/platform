import { describe, expect, it } from 'vitest';
import {
  computeBackoffMs,
  RECONNECT_MAX_ATTEMPTS,
  RECONNECT_MAX_MS,
  shouldReconnect,
} from './reconnect';

const noJitter = () => 1;

describe('reconnect backoff', () => {
  it('doubles the ceiling per attempt', () => {
    expect(computeBackoffMs(0, { jitter: noJitter })).toBe(500);
    expect(computeBackoffMs(1, { jitter: noJitter })).toBe(1000);
    expect(computeBackoffMs(2, { jitter: noJitter })).toBe(2000);
    expect(computeBackoffMs(3, { jitter: noJitter })).toBe(4000);
  });

  it('never exceeds the cap however many attempts have failed', () => {
    for (const attempt of [10, 50, 1000]) {
      expect(computeBackoffMs(attempt, { jitter: noJitter })).toBe(
        RECONNECT_MAX_MS
      );
    }
  });

  it('applies full jitter so a mass reconnect does not stampede', () => {
    expect(computeBackoffMs(3, { jitter: () => 0 })).toBe(0);
    expect(computeBackoffMs(3, { jitter: () => 0.5 })).toBe(2000);
    expect(computeBackoffMs(3, { jitter: noJitter })).toBe(4000);
  });

  it('treats a negative or fractional attempt as the first one', () => {
    expect(computeBackoffMs(-5, { jitter: noJitter })).toBe(500);
    expect(computeBackoffMs(0.9, { jitter: noJitter })).toBe(500);
  });
});

describe('reconnect eligibility', () => {
  it('retries an unexpected drop', () => {
    expect(shouldReconnect(0)).toBe(true);
    expect(shouldReconnect(3, 1006)).toBe(true);
  });

  it('does not fight a clean close', () => {
    expect(shouldReconnect(0, 1000)).toBe(false);
  });

  it('does not rejoin a participant the host removed', () => {
    expect(shouldReconnect(0, 4403)).toBe(false);
  });

  it('gives up after the attempt ceiling', () => {
    expect(shouldReconnect(RECONNECT_MAX_ATTEMPTS - 1)).toBe(true);
    expect(shouldReconnect(RECONNECT_MAX_ATTEMPTS)).toBe(false);
  });
});
