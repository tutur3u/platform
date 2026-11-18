import { describe, expect, it } from 'vitest';
import {
  getPollCountdownState,
  summarizeParticipation,
} from './poll-countdown';

describe('poll countdown', () => {
  it('rounds up to whole seconds and uses an exact urgency threshold', () => {
    expect(getPollCountdownState(90_000, 60_000)).toEqual({
      remainingMs: 30_000,
      formatted: '00:30',
      isUrgent: false,
      isExpired: false,
      progress: 0.5,
    });
    expect(getPollCountdownState(90_000, 60_001)).toMatchObject({
      remainingMs: 29_999,
      formatted: '00:30',
      isUrgent: true,
    });
    expect(getPollCountdownState(90_000, 89_999).formatted).toBe('00:01');
  });

  it.each([90_000, 91_000, Number.NaN])('expires at %s', (now) => {
    expect(getPollCountdownState(90_000, now)).toEqual({
      remainingMs: 0,
      formatted: '00:00',
      isUrgent: false,
      isExpired: true,
      progress: 0,
    });
  });

  it('supports longer durations and saturates progress before a poll starts', () => {
    expect(getPollCountdownState(300_000, 224_000, 120_000)).toMatchObject({
      formatted: '01:16',
      progress: 76 / 120,
    });
    expect(getPollCountdownState(300_000, 0, 120_000).progress).toBe(1);
  });
});

describe('poll participation', () => {
  it('reports voted, remaining, and rounded percentage', () => {
    expect(summarizeParticipation(2, 3)).toEqual({
      votedCount: 2,
      totalCount: 3,
      remainingCount: 1,
      percentage: 67,
    });
  });

  it('keeps percentages bounded and handles empty or invalid counts', () => {
    expect(summarizeParticipation(5, 3)).toMatchObject({
      votedCount: 3,
      remainingCount: 0,
      percentage: 100,
    });
    expect(summarizeParticipation(Number.NaN, -1)).toEqual({
      votedCount: 0,
      totalCount: 0,
      remainingCount: 0,
      percentage: 0,
    });
  });
});
