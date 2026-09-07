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
});
