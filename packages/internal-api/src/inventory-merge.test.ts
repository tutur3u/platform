import { describe, expect, it, vi } from 'vitest';
import { applyInventoryMerge, previewInventoryMerge } from './inventory-merge';

describe('inventory merge transport', () => {
  it('previews encoded workspace and pair with uncached GET', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ version: 'v' })));
    await previewInventoryMerge(
      'ws/one',
      { kind: 'warehouse', sourceId: 'source', targetId: 'target' },
      { baseUrl: 'https://inventory.test', fetch }
    );
    const [url, init] = fetch.mock.calls[0]!;
    const parsed = new URL(url);
    expect(parsed.pathname).toBe(
      '/api/v1/workspaces/ws%2Fone/inventory/merges'
    );
    expect(parsed.searchParams.get('sourceId')).toBe('source');
    expect(parsed.searchParams.get('targetId')).toBe('target');
    expect(parsed.searchParams.get('kind')).toBe('warehouse');
    expect(init.cache).toBe('no-store');
  });
  it('posts preview version/policies and preserves authentication headers', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ merged: true, targetId: 'target' }))
      );
    const payload = {
      kind: 'product' as const,
      sourceId: 'source',
      targetId: 'target',
      version: 'v',
      metadata: 'source' as const,
      stockPolicy: 'target' as const,
    };
    await applyInventoryMerge('ws', payload, {
      baseUrl: 'https://inventory.test',
      fetch,
      defaultHeaders: { Authorization: 'Bearer synthetic-fixture' },
    });
    const init = fetch.mock.calls[0]![1];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(payload);
    expect(new Headers(init.headers).get('Authorization')).toBe(
      'Bearer synthetic-fixture'
    );
    expect(new Headers(init.headers).get('Content-Type')).toBe(
      'application/json'
    );
  });
});
