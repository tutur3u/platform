import { expect, it } from 'vitest';
import { generatePreview } from './preview-engine';

it.each(['google', 'microsoft'] as const)(
  'task previews preserve unlocked %s meeting commitments',
  (provider) => {
    const event = {
      id: 'meeting',
      provider,
      locked: false,
      start_at: '2026-10-07T10:00:00Z',
      end_at: '2026-10-07T11:00:00Z',
    };
    const result = generatePreview([], [], [event], {} as any, {
      now: new Date('2026-10-07T09:00:00Z'),
      windowDays: 1,
    });
    expect(result.steps[0]?.debug?.slotsAvailable).toBe(1);
  }
);
