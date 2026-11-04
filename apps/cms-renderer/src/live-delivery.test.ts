import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/first-site.json';
import { loadPublishedPage } from './live-delivery';
import { authorizePurge } from './purge-auth';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const entry = {
  id: 'english-about', slug: 'en/about', title: 'First site about', status: 'published',
  metadata: { description: 'Synthetic description', ogImage: 'https://first.invalid/og.png' },
  published_page_version_id: 'snapshot-one',
  publishedPageVersion: { id: 'snapshot-one', ws_id: workspaceId, entry_id: 'english-about', status: 'published', schema_version: 1, data: fixture },
};
function read(value: unknown, status = 200) {
  const calls: URL[] = [];
  const fetcher: typeof fetch = async (input) => {
    calls.push(new URL(input instanceof Request ? input.url : String(input)));
    return Response.json(value, { status });
  };
  return { calls, result: loadPublishedPage({ origin: 'https://live-api.invalid', workspaceId, path: '/en/about', fetch: fetcher }) };
}
const payload = (item: unknown) => ({ workspaceId, collections: [{ entries: [item] }] });

describe('live delivery adapter', () => {
  it('maps the service-read snapshot and full-path SEO without requesting previews', async () => {
    const test = read(payload(entry));
    expect(await test.result).toMatchObject({ kind: 'page', page: fixture, versionId: 'snapshot-one', title: entry.title, description: entry.metadata.description, ogImage: entry.metadata.ogImage });
    expect(test.calls[0]?.pathname).toBe(`/api/v1/workspaces/${workspaceId}/external-projects/delivery`);
    expect(test.calls[0]?.search).toBe('');
  });
  it('also accepts the Rust delivery snapshot shape', async () => {
    expect(await read(payload({ ...entry, publishedPageVersion: { id: 'snapshot-one', schema_version: 1, blocks: fixture } })).result).toMatchObject({ kind: 'page' });
  });
  it('does not substitute legacy mutable blocks when no snapshot exists', async () => {
    expect(await read(payload({ ...entry, publishedPageVersion: null, blocks: fixture.content })).result).toEqual({ kind: 'missing' });
  });
  it('rejects draft, cross-tenant, cross-entry and wrong-pointer snapshots', async () => {
    for (const fields of [{ status: 'draft' }, { ws_id: 'other' }, { entry_id: 'other' }, { id: 'other' }]) {
      expect(await read(payload({ ...entry, publishedPageVersion: { ...entry.publishedPageVersion, ...fields } })).result).toEqual({ kind: 'unavailable' });
    }
    expect(await read({ ...payload(entry), workspaceId: 'other' }).result).toEqual({ kind: 'unavailable' });
  });
  it('maps missing binding without attempting a fallback request', async () => {
    const test = read({ error: 'No CMS binding' }, 409);
    expect(await test.result).toEqual({ kind: 'unbound' });
    expect(test.calls).toHaveLength(1);
  });
});

describe('purge authorization', () => {
  it('accepts the shared bearer token and denies missing or mismatched credentials', () => {
    expect(authorizePurge('Bearer synthetic-token', 'synthetic-token')).toBe(true);
    for (const header of [null, '', 'synthetic-token', 'Bearer synthetic-token-extra', 'Bearer synthetiC-token']) {
      expect(authorizePurge(header, 'synthetic-token')).toBe(false);
    }
    expect(authorizePurge('Bearer undefined', undefined)).toBe(false);
    expect(authorizePurge('Bearer ', '')).toBe(false);
  });
});
