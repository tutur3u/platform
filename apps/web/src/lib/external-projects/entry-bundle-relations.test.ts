import { describe, expect, it } from 'vitest';
import {
  ENTRY_BUNDLE_MAX_RELATIONS,
  entryBundleRelationSchema,
  entryBundleRelationsSchema,
  RELATION_METADATA_MAX_BYTES,
  RELATION_METADATA_STRING_MAX_LENGTH,
} from './entry-bundle-relations';

const definitionId = '00000000-0000-4000-8000-000000000001';
const toEntryId = '00000000-0000-4000-8000-000000000002';

function parse(metadata: unknown, extra: Record<string, unknown> = {}) {
  return entryBundleRelationSchema.safeParse({
    definitionId,
    metadata,
    toEntryId,
    ...extra,
  });
}

describe('entry bundle relation schema', () => {
  it('accepts flat scalar metadata and a sort order', () => {
    const result = parse(
      {
        direction: 'inverse',
        kind: 'mentor',
        note: 'n'.repeat(RELATION_METADATA_STRING_MAX_LENGTH),
        strength: 3,
        spoiler: false,
        since: null,
      },
      { sortOrder: 4 }
    );
    expect(result.success).toBe(true);
    expect(result.data?.sortOrder).toBe(4);
  });

  it('defaults missing metadata and sort order', () => {
    const result = entryBundleRelationSchema.parse({ definitionId, toEntryId });
    expect(result).toEqual({
      definitionId,
      metadata: {},
      sortOrder: 0,
      toEntryId,
    });
  });

  it.each([
    ['nested objects', { kind: { nested: true } }],
    ['arrays', { kind: ['a'] }],
    [
      'long strings',
      { note: 'n'.repeat(RELATION_METADATA_STRING_MAX_LENGTH + 1) },
    ],
    ['empty keys', { '': 'value' }],
    ['keys with surrounding spaces', { ' kind': 'mentor' }],
    ['non-object metadata', 'mentor'],
  ])('refuses %s', (_label, metadata) => {
    expect(parse(metadata).success).toBe(false);
  });

  it('refuses metadata larger than the byte cap', () => {
    const metadata = Object.fromEntries(
      Array.from({ length: 10 }, (_, index) => [
        `field${index}`,
        'x'.repeat(RELATION_METADATA_STRING_MAX_LENGTH),
      ])
    );
    expect(JSON.stringify(metadata).length).toBeGreaterThan(
      RELATION_METADATA_MAX_BYTES
    );
    expect(parse(metadata).success).toBe(false);
  });

  it('counts multi-byte characters against the byte cap', () => {
    const metadata = Object.fromEntries(
      Array.from({ length: 3 }, (_, index) => [`note${index}`, 'ứ'.repeat(280)])
    );
    expect(JSON.stringify(metadata).length).toBeLessThan(
      RELATION_METADATA_MAX_BYTES
    );
    expect(parse(metadata).success).toBe(false);
  });

  it('refuses negative or fractional sort orders', () => {
    expect(parse({}, { sortOrder: -1 }).success).toBe(false);
    expect(parse({}, { sortOrder: 1.5 }).success).toBe(false);
  });

  it('caps the number of relations in one bundle', () => {
    const relation = { definitionId, toEntryId };
    expect(
      entryBundleRelationsSchema.safeParse(
        Array.from({ length: ENTRY_BUNDLE_MAX_RELATIONS }, () => relation)
      ).success
    ).toBe(true);
    expect(
      entryBundleRelationsSchema.safeParse(
        Array.from({ length: ENTRY_BUNDLE_MAX_RELATIONS + 1 }, () => relation)
      ).success
    ).toBe(false);
  });
});
