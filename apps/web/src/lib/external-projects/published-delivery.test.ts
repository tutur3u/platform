import type { ExternalProjectDeliveryPayload } from '@tuturuuu/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const read = vi.hoisted(() => vi.fn());
vi.mock('./page-versions', () => ({ getPublishedPageVersion: read }));

import { attachPublishedPageVersions } from './published-delivery';

const payload = {
  workspaceId: 'workspace',
  revision: 'legacy-revision',
  collections: [
    {
      entries: [
        {
          id: 'entry',
          published_page_version_id: '11111111-1111-4111-8111-111111111111',
          slug: 'en/about',
          metadata: {
            description: 'About',
            ogImage: 'https://example.com/og.png',
          },
          blocks: ['mutable'],
        },
      ],
    },
  ],
} as unknown as ExternalProjectDeliveryPayload;
const version = {
  id: '11111111-1111-4111-8111-111111111111',
  status: 'published',
  ws_id: 'workspace',
  entry_id: 'entry',
  data: { content: [] },
  schema_version: 1,
  published_at: '2026-11-04T00:00:00Z',
  note: 'Private editorial note',
  created_by: 'editor',
  published_by: 'publisher',
  version_number: 7,
};
const run = () => attachPublishedPageVersions(payload, {} as never);
beforeEach(() => {
  read.mockReset();
});
describe('live published page snapshots', () => {
  it('attaches the published snapshot and preserves full-path slugs and SEO', async () => {
    read.mockResolvedValue(version);
    const result = await run();
    expect(result.collections[0]?.entries[0]).toMatchObject({
      slug: 'en/about',
      metadata: { description: 'About', ogImage: 'https://example.com/og.png' },
      publishedPageVersion: {
        id: version.id,
        entry_id: version.entry_id,
        schema_version: version.schema_version,
        data: version.data,
        published_at: version.published_at,
      },
    });
    expect(result.collections[0]?.entries[0]?.publishedPageVersion).toEqual({
      id: version.id,
      entry_id: version.entry_id,
      schema_version: version.schema_version,
      data: version.data,
      published_at: version.published_at,
    });
    expect(read).toHaveBeenCalledWith(
      {},
      { workspaceId: 'workspace', entryId: 'entry' }
    );
  });
  it('changes the ETag revision when only the published pointer changes', async () => {
    const nextId = '22222222-2222-4222-8222-222222222222';
    read
      .mockResolvedValueOnce(version)
      .mockResolvedValueOnce({ ...version, id: nextId });
    const first = await run();
    const next = structuredClone(payload);
    const entry = next.collections[0]?.entries[0];
    if (!entry) throw new Error('Missing test entry');
    Object.assign(entry, { published_page_version_id: nextId });
    expect(first.revision).not.toBe(
      (await attachPublishedPageVersions(next, {} as never)).revision
    );
  });
  it('does not replace an absent snapshot with mutable blocks', async () => {
    read.mockResolvedValue(null);
    expect(
      (await run()).collections[0]?.entries[0]?.publishedPageVersion
    ).toBeNull();
  });
  it.each([{ status: 'draft' }, { ws_id: 'other' }, { entry_id: 'other' }])(
    'denies an invalid service read %j',
    async (invalid) => {
      read.mockResolvedValue({ ...version, ...invalid });
      await expect(run()).rejects.toMatchObject({
        message: 'Published page scope mismatch',
      });
    }
  );
  it('does not return legacy content if the published read fails', async () => {
    const error = new Error('DB unavailable');
    read.mockRejectedValue(error);
    await expect(run()).rejects.toBe(error);
  });
});
