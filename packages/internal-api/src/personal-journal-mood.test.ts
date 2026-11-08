import { describe, expect, it } from 'vitest';
import {
  JOURNAL_MOOD_SCORES,
  type JournalEntry,
  journalExportFilename,
  journalExportPayload,
  journalMoodScore,
  journalMoodSeries,
} from './personal-journal';

const entry = {
  id: '00000000-0000-4000-8000-000000000001',
  actorId: '00000000-0000-4000-8000-000000000010',
  workspaceId: '00000000-0000-4000-8000-000000000020',
  title: 'Synthetic title',
  body: 'Synthetic body that must stay out of the chart',
  occurredAt: '2026-01-01T00:30:00.000Z',
  timezone: 'America/Los_Angeles',
  mood: 'good',
  moodContext: 'Synthetic context that must stay out of the chart',
  domain: 'life',
  category: 'reflection',
  revision: 1,
  createdAt: '2026-01-01T00:30:00.000Z',
  updatedAt: '2026-01-01T00:30:00.000Z',
} satisfies JournalEntry;

describe('journal mood series', () => {
  it('maps the self-reported scale and skips a missing mood', () => {
    expect(JOURNAL_MOOD_SCORES).toEqual({
      very_low: 1,
      low: 2,
      neutral: 3,
      good: 4,
      great: 5,
    });
    expect(journalMoodScore(null)).toBeNull();
    expect(journalMoodScore('great')).toBe(5);
    expect(
      journalMoodSeries(
        [entry, { ...entry, mood: null }, { ...entry, mood: 'great' }],
        'UTC',
        'day'
      )
    ).toEqual([{ period: '2026-01-01', sum: 9, count: 2 }]);
  });

  it('groups by the chosen timezone and keeps prose out of the points', () => {
    const points = journalMoodSeries([entry], 'America/Los_Angeles', 'day');
    expect(points).toEqual([{ period: '2025-12-31', sum: 4, count: 1 }]);
    expect(JSON.stringify(points)).not.toContain('Synthetic');
  });
});

describe('journal export', () => {
  it('copies the owner entries and names the file from the timestamp', () => {
    const payload = journalExportPayload([entry], {
      complete: false,
      exportedAt: '2026-11-09T05:20:00.000Z',
    });
    expect(payload.kind).toBe('tuturuuu.personal-journal');
    expect(payload.complete).toBe(false);
    expect(payload.entries).toEqual([entry]);
    expect(journalExportFilename(payload.exportedAt)).toBe(
      'personal-journal-2026-11-09.json'
    );
  });

  it('refuses an extra field on an entry', () => {
    expect(() =>
      journalExportPayload(
        [{ ...entry, inferredMood: 'sad' } as JournalEntry],
        { complete: true, exportedAt: '2026-11-09T05:20:00.000Z' }
      )
    ).toThrow();
  });
});
