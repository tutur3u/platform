import { describe, expect, it } from 'vitest';
import {
  createPersonalJournal,
  journalDocumentSchema,
  journalPeriodKey,
  listPersonalJournal,
} from './personal-journal';

const document = {
  title: 'A moment',
  body: 'Original source',
  occurredAt: '2026-01-01T00:30:00.000Z',
  timezone: 'America/Los_Angeles',
  mood: 'good',
  moodContext: 'My choice',
  domain: 'life',
  category: 'reflection',
};
describe('personal journal boundary', () => {
  it('preserves original content and refuses sharing/inferred metadata', () => {
    expect(journalDocumentSchema.parse(document)).toEqual(document);
    expect(
      journalDocumentSchema.safeParse({ ...document, inferredMood: 'sad' })
        .success
    ).toBe(false);
    expect(
      journalDocumentSchema.safeParse({ ...document, timezone: 'unknown/zone' })
        .success
    ).toBe(false);
    expect(
      journalDocumentSchema.safeParse({ ...document, actorId: 'foreign' })
        .success
    ).toBe(false);
  });
  it('groups exact instants by chosen timezone across day, week and year boundaries', () => {
    expect(
      journalPeriodKey(document.occurredAt, document.timezone, 'day')
    ).toBe('2025-12-31');
    expect(
      journalPeriodKey(document.occurredAt, document.timezone, 'week')
    ).toBe('2025-12-29');
    expect(
      journalPeriodKey(document.occurredAt, document.timezone, 'month')
    ).toBe('2025-12');
    expect(
      journalPeriodKey(document.occurredAt, document.timezone, 'year')
    ).toBe('2025');
    expect(
      journalPeriodKey('2026-03-08T10:30:00.000Z', document.timezone, 'day')
    ).toBe('2026-03-08');
  });
  it('rejects malformed success instead of acknowledging a write', async () => {
    const fetcher: typeof fetch = async () =>
      new Response(JSON.stringify({ success: true }), { status: 200 });
    await expect(
      createPersonalJournal(
        'personal',
        {
          id: '00000000-0000-4000-8000-000000000001',
          document: journalDocumentSchema.parse(document),
        },
        { fetch: fetcher }
      )
    ).rejects.toThrow();
  });
  it('rejects incomplete list payloads', async () => {
    const fetcher: typeof fetch = async () =>
      new Response(JSON.stringify({ items: [] }), { status: 200 });
    await expect(
      listPersonalJournal('personal', undefined, { fetch: fetcher })
    ).rejects.toThrow();
  });
});
