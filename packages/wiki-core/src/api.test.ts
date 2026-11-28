import { describe, expect, it } from 'vitest';
import {
  wikiBulkSchema,
  wikiCreatePageSchema,
  wikiGetPageQuerySchema,
  wikiPublishPageSchema,
  wikiSavePageSchema,
  wikiSetVisibilitySchema,
  wikiUpsertRedirectSchema,
} from './api';

describe('wiki route payloads', () => {
  it('validates private-by-default writes and the revision fence', () => {
    const draft = { title: 'Draft', slug: 'draft', body: { type: 'doc' } };
    expect(wikiCreatePageSchema.safeParse(draft).success).toBe(true);
    expect(
      wikiCreatePageSchema.safeParse({ ...draft, visibility: 'public' }).success
    ).toBe(false);
    expect(
      wikiSavePageSchema.safeParse({ title: draft.title, body: draft.body })
        .success
    ).toBe(false);
    expect(
      wikiSetVisibilitySchema.safeParse({ visibility: 'public' }).success
    ).toBe(false);
    expect(
      wikiPublishPageSchema.safeParse({
        revision: 1,
        receipt: 'caller-supplied',
      }).success
    ).toBe(false);
  });

  it('defaults bulk to dry run and requires exact archive confirmation for writes', () => {
    const operation = {
      op: 'archive',
      page_id: '00000000-0000-4000-8000-000000000001',
      base_revision: 1,
    };
    const operations = Array.from({ length: 11 }, () => operation);
    expect(wikiBulkSchema.parse({ operations }).dry_run).toBe(true);
    expect(
      wikiBulkSchema.safeParse({
        operations,
        dry_run: false,
        allow_archive: 10,
      }).success
    ).toBe(false);
    expect(
      wikiBulkSchema.safeParse({
        operations,
        dry_run: false,
        allow_archive: 11,
      }).success
    ).toBe(true);
    expect(
      wikiBulkSchema.safeParse({
        operations: Array.from({ length: 51 }, () => operation),
      }).success
    ).toBe(false);
  });

  it('accepts canonical paths, positive query revisions and wiki-only redirects', () => {
    expect(
      wikiGetPageQuerySchema.parse({ path: 'guides/start', revision: '2' })
    ).toEqual({
      path: 'guides/start',
      revision: 2,
      format: 'json',
    });
    expect(
      wikiGetPageQuerySchema.safeParse({ path: '../overview' }).success
    ).toBe(false);
    expect(
      wikiUpsertRedirectSchema.safeParse({
        from_path: 'old',
        to_url: 'https://example.com/',
      }).success
    ).toBe(false);
    expect(
      wikiUpsertRedirectSchema.safeParse({
        from_path: 'old',
        to_url: '/wiki/tuturuuu/new',
      }).success
    ).toBe(true);
  });
});
