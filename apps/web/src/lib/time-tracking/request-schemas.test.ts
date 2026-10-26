import { describe, expect, it } from 'vitest';
import { sessionCreateSchema } from './session-request-schemas';
import { MAX_STATS_DAYS_BACK, statsQuerySchema } from './stats-query-schema';

describe('sessionCreateSchema tags', () => {
  it('accepts tags when starting a running session', () => {
    const result = sessionCreateSchema.safeParse({
      title: 'Focus',
      tags: ['pomodoro'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects tags on a manual entry instead of dropping them', () => {
    const result = sessionCreateSchema.safeParse({
      title: 'Focus',
      startTime: '2026-10-26T01:00:00Z',
      endTime: '2026-10-26T01:25:00Z',
      tags: ['pomodoro'],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['tags']);
  });

  it('keeps manual entries without tags valid', () => {
    const result = sessionCreateSchema.safeParse({
      title: 'Focus',
      startTime: '2026-10-26T01:00:00Z',
      endTime: '2026-10-26T01:25:00Z',
      tags: [],
    });
    expect(result.success).toBe(true);
  });
});

describe('statsQuerySchema daysBack', () => {
  const base = {
    userId: '00000000-0000-4000-8000-000000000001',
    isPersonal: 'false',
  };

  it('caps daysBack at a year', () => {
    const result = statsQuerySchema.parse({ ...base, daysBack: '5000' });
    expect(result.daysBack).toBe(MAX_STATS_DAYS_BACK);
  });

  it('keeps smaller windows and the 365-day default', () => {
    expect(statsQuerySchema.parse({ ...base, daysBack: '7' }).daysBack).toBe(7);
    expect(statsQuerySchema.parse(base).daysBack).toBe(365);
  });
});
