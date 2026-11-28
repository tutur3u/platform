import { describe, expect, it } from 'vitest';
import {
  wikiAssetMetadataSchema,
  wikiAssetUploadSchema,
  wikiBulkSchema,
  wikiCreatePageSchema,
  wikiDeleteRedirectSchema,
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

  it('derives the write source on the server and requires a readable title', () => {
    const body = { type: 'doc' };
    const page = { body, slug: 'draft', title: '  Draft  ' };
    const revision = { body, base_revision: 1, title: 'Draft' };
    expect(wikiCreatePageSchema.parse(page).title).toBe('Draft');
    expect(
      wikiCreatePageSchema.safeParse({ ...page, title: '   ' }).success
    ).toBe(false);
    expect(
      wikiCreatePageSchema.safeParse({ ...page, source: 'import' }).success
    ).toBe(false);
    expect(
      wikiSavePageSchema.safeParse({ ...revision, source: 'import' }).success
    ).toBe(false);
    expect(
      wikiBulkSchema.safeParse({
        operations: [{ ...page, op: 'create', source: 'import' }],
      }).success
    ).toBe(false);
  });

  it('separates client image hints from persisted file properties', () => {
    const hints = { alt: 'Diagram', width: 4096, height: 1 };
    const file = { sha256: 'a'.repeat(64), mime: 'image/png', bytes: 10 };
    expect(wikiAssetUploadSchema.parse(hints)).toEqual(hints);
    expect(
      wikiAssetUploadSchema.safeParse({ ...hints, width: 4097 }).success
    ).toBe(false);
    for (const [key, value] of Object.entries(file)) {
      expect(
        wikiAssetUploadSchema.safeParse({ ...hints, [key]: value }).success
      ).toBe(false);
    }
    expect(
      wikiAssetMetadataSchema.safeParse({ ...hints, ...file }).success
    ).toBe(true);
  });

  it('requires source paths for redirect mutations', () => {
    expect(
      wikiUpsertRedirectSchema.safeParse({
        from_path: '',
        to_url: '/wiki/tuturuuu/new',
      }).success
    ).toBe(false);
    expect(wikiDeleteRedirectSchema.safeParse({ from_path: '' }).success).toBe(
      false
    );
    expect(
      wikiDeleteRedirectSchema.safeParse({ from_path: 'old' }).success
    ).toBe(true);
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
