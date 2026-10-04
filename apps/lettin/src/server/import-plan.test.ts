import { describe, expect, it } from 'vitest';
import { buildImportPlan } from './import-plan';
import { isTuturuuuStaffEmail } from './staff-access';

const source = (id: string, collectionSlug = 'characters') => ({
  stableSourceId: id,
  collectionSlug,
  title: `Synthetic ${id}`,
});

describe('Exocorpse canonical import boundary', () => {
  it.each(['artist@tuturuuu.com', 'Artist@TUTURUUU.COM'])(
    'recognizes the exact staff domain: %s',
    (email) => expect(isTuturuuuStaffEmail(email)).toBe(true)
  );
  it.each([
    null,
    'artist@example.test',
    'artist@tuturuuu.com.evil.test',
    'artist@@tuturuuu.com',
    ' artist@tuturuuu.com',
  ])('rejects an ineligible address: %s', (email) => {
    expect(isTuturuuuStaffEmail(email)).toBe(false);
  });
  it('supports canonical bundles and maps stable relationships without dangling links', () => {
    const plan = buildImportPlan(
      {
        entries: [
          {
            entry: source('hero'),
            relations: [
              { targetStableSourceId: 'home', definitionKey: 'location' },
              { targetStableSourceId: 'home', definitionKey: 'location' },
              { targetStableSourceId: 'missing', definitionKey: 'related' },
              { targetStableSourceId: 'hero', definitionKey: 'related' },
            ],
            blocks: [
              {
                blockType: 'markdown',
                content: { markdown: '**A synthetic hero**' },
              },
            ],
          },
          { entry: source('home', 'locations') },
        ],
      },
      'Imported notebook'
    );
    expect(plan.entries.map((entry) => entry.draft.kind)).toEqual([
      'character',
      'location',
    ]);
    expect(plan.entries[0]?.draft.wiki?.relationships).toEqual([
      { targetId: plan.entries[1]?.id, kind: 'located', label: 'location' },
    ]);
    expect(JSON.stringify(plan.entries[0]?.draft.content)).toContain('bold');
  });
  it('keeps blacklists separate from wiki entries and drops unsafe references', () => {
    const plan = buildImportPlan(
      {
        entries: [
          {
            ...source('private', 'commission-blacklist'),
            profileData: {
              username: 'Synthetic account',
              reasoning: 'Private note',
              url: 'javascript:alert(1)',
            },
          },
          source('unsupported', 'heaven-space'),
        ],
      },
      'Notebook'
    );
    expect(plan.entries).toEqual([]);
    expect(plan.blacklist).toMatchObject([
      {
        displayName: 'Synthetic account',
        reason: 'Private note',
        referenceUrl: '',
      },
    ]);
    expect(plan.skipped).toBe(1);
  });
  it('preserves event chronology and sanitizes executable Markdown URLs', () => {
    const plan = buildImportPlan(
      {
        content: {
          entries: [
            {
              ...source('event', 'events'),
              profileData: { dateYear: -20, date: 'Before the crossing' },
              bodyMarkdown:
                '[Unsafe](javascript:alert) ![Unsafe image](http://example.test/image.png)',
            },
          ],
        },
      },
      'Notebook'
    );
    expect(plan.entries[0]?.draft.wiki?.chronology).toMatchObject({
      order: -20,
      label: 'Before the crossing',
    });
    expect(JSON.stringify(plan.entries[0]?.draft.content)).not.toContain(
      '"href":"javascript:'
    );
    expect(JSON.stringify(plan.entries[0]?.draft.content)).not.toContain(
      'http://example.test'
    );
  });
  it.each([
    { adapter: 'another-app', entries: [source('a')] },
    { entries: [source('a'), source('a')] },
    { entries: [{ collectionSlug: 'characters', title: 'Missing identity' }] },
    { entries: [] },
    { entries: [source('a', 'unsupported')] },
  ])('rejects invalid or unsupported exports', (payload) => {
    expect(() => buildImportPlan(payload, 'Notebook')).toThrow();
  });
});
