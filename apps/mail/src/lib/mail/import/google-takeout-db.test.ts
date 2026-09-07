import { describe, expect, it } from 'vitest';
import {
  ensureImportLabels,
  escapeLikePattern,
  sanitizePostgrestPayload,
} from '../../../../scripts/google-takeout-db';
import type { AnyRecord } from '../repository/shared';

describe('Google Takeout database helpers', () => {
  it('escapes case-insensitive exact-match wildcard characters', () => {
    expect(escapeLikePattern(String.raw`Name_%\\Box@Example.com`)).toBe(
      String.raw`Name\_\%\\\\Box@Example.com`
    );
  });

  it('replaces unpaired UTF-16 surrogates throughout PostgREST rows', () => {
    expect(
      sanitizePostgrestPayload({
        header: `before\uD800after`,
        nested: [`low\uDC00`, 'valid \uD83D\uDE80'],
      })
    ).toEqual({
      header: 'before�after',
      nested: ['low�', 'valid 🚀'],
    });
  });

  it('preserves values whose object keys collide after sanitizing', () => {
    expect(
      sanitizePostgrestPayload({
        'legacy\uD800header': 'first',
        'legacy\uDC00header': 'second',
      })
    ).toEqual({
      'legacy�header': 'first',
      'legacy�header [import duplicate 2]': 'second',
    });
  });

  it('preserves an own __proto__ key without mutating the accumulator', () => {
    const payload = Object.create(null) as Record<string, string>;
    Object.defineProperty(payload, '__proto__', {
      configurable: true,
      enumerable: true,
      value: 'legacy header value',
    });

    const sanitized = sanitizePostgrestPayload(payload);

    expect(Object.getPrototypeOf(sanitized)).toBeNull();
    expect(Object.getOwnPropertyDescriptor(sanitized, '__proto__')?.value).toBe(
      'legacy header value'
    );
  });

  it('reuses an existing label with the same display name', async () => {
    const existing = [{ id: 'existing-id', name: 'Résumé', slug: 'resume' }];
    let upserted: AnyRecord[] = [];
    const admin = {
      schema: () => ({
        from: () => ({
          select: () => ({
            eq: async () => ({ data: existing, error: null }),
          }),
          upsert: async (rows: AnyRecord[]) => {
            upserted = rows;
            return { error: null };
          },
        }),
      }),
    } as AnyRecord;

    const ids = await ensureImportLabels({
      admin,
      customLabels: new Map([['resume-generated-hash', 'Résumé']]),
      mailboxId: 'mailbox-id',
    });

    expect(upserted).not.toContainEqual(
      expect.objectContaining({ name: 'Résumé' })
    );
    expect(ids.get('resume-generated-hash')).toBe('existing-id');
  });

  it('sanitizes malformed custom label names before persistence', async () => {
    let upserted: AnyRecord[] = [];
    const admin = {
      schema: () => ({
        from: () => ({
          select: () => ({
            eq: async () => ({
              data: [{ id: 'safe-id', name: 'Legacy � label', slug: 'legacy' }],
              error: null,
            }),
          }),
          upsert: async (rows: AnyRecord[]) => {
            upserted = rows;
            return { error: null };
          },
        }),
      }),
    } as AnyRecord;

    const ids = await ensureImportLabels({
      admin,
      customLabels: new Map([['legacy-generated', `Legacy \uD800 label`]]),
      mailboxId: 'mailbox-id',
    });

    expect(upserted).not.toContainEqual(
      expect.objectContaining({ name: `Legacy \uD800 label` })
    );
    expect(ids.get('legacy-generated')).toBe('safe-id');
  });

  it('groups custom labels whose names collide after sanitizing', async () => {
    let upserted: AnyRecord[] = [];
    const persisted = [
      { id: 'grouped-id', name: 'Legacy � label', slug: 'legacy-high' },
    ];
    let selectCount = 0;
    const admin = {
      schema: () => ({
        from: () => ({
          select: () => ({
            eq: async () => {
              selectCount += 1;
              return {
                data: selectCount === 1 ? [] : persisted,
                error: null,
              };
            },
          }),
          upsert: async (rows: AnyRecord[]) => {
            upserted = rows;
            return { error: null };
          },
        }),
      }),
    } as AnyRecord;

    const ids = await ensureImportLabels({
      admin,
      customLabels: new Map([
        ['legacy-high', `Legacy \uD800 label`],
        ['legacy-low', `Legacy \uDC00 label`],
      ]),
      mailboxId: 'mailbox-id',
    });

    expect(
      upserted.filter((row) => row.name === 'Legacy � label')
    ).toHaveLength(1);
    expect(ids.get('legacy-high')).toBe('grouped-id');
    expect(ids.get('legacy-low')).toBe('grouped-id');
  });
});
