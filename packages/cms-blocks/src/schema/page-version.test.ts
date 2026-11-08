import { describe, expect, it } from 'vitest';
import { samplePage } from './fixtures.test-utils';
import {
  CMS_PAGE_VERSION_MAX_BYTES,
  parseCmsPageVersion,
  toCmsPageVersionPayload,
} from './page-version';

describe('cms page version payloads', () => {
  it('round-trips a page through the stored payload', () => {
    const payload = toCmsPageVersionPayload(samplePage);
    expect(payload.schema_version).toBe(1);
    expect(parseCmsPageVersion(JSON.parse(JSON.stringify(payload)))).toEqual(
      samplePage
    );
  });

  it('rejects invalid, oversized and unsupported versions', () => {
    expect(() =>
      toCmsPageVersionPayload({ ...samplePage, schemaVersion: 2 })
    ).toThrow();
    const card = {
      body: 'x'.repeat(2000),
      href: '',
      imageUrl: '',
      title: 'x'.repeat(2000),
    };
    const oversized = {
      ...samplePage,
      content: Array.from({ length: 30 }, (_, i) => ({
        props: { cards: Array(24).fill(card), columns: '3', id: `g${i}` },
        type: 'CardGrid',
      })),
    };
    expect(JSON.stringify(oversized).length).toBeGreaterThan(
      CMS_PAGE_VERSION_MAX_BYTES
    );
    expect(() => toCmsPageVersionPayload(oversized)).toThrow(RangeError);
    expect(
      parseCmsPageVersion({ data: samplePage, schema_version: 2 })
    ).toBeNull();
    expect(
      parseCmsPageVersion({ data: { content: 'nope' }, schema_version: 1 })
    ).toBeNull();
  });
});
