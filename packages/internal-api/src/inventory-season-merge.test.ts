import { describe, expect, it, vi } from 'vitest';
import {
  applyInventorySeasonMerge,
  previewInventorySeasonMerge,
} from './inventory-season-merge';

describe('inventory merge transport', () => {
  it('previews encoded workspace and pair with uncached GET', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ version: 'v' })));
    await previewInventorySeasonMerge(
      'ws/one',
      { sourceId: 'source', targetId: 'target', version: 'frozen', page: 6 },
      { baseUrl: 'https://inventory.test', fetch }
    );
    const [url, init] = fetch.mock.calls[0]!;
    const parsed = new URL(url);
    expect(parsed.pathname).toBe(
      '/api/v1/workspaces/ws%2Fone/inventory/sales-periods/merges'
    );
    expect(parsed.searchParams.get('sourceId')).toBe('source');
    expect(parsed.searchParams.get('targetId')).toBe('target');
    expect(parsed.searchParams.get('version')).toBe('frozen');
    expect(parsed.searchParams.get('page')).toBe('6');
    expect(new Request(url, init).method).toBe('GET');
    expect(init.cache).toBe('no-store');
  });
  it('posts preview version/policies and preserves authentication headers', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ merged: true, targetId: 'target' }))
      );
    const payload = {
      sourceId: 'source',
      targetId: 'target',
      version: 'v',
      descriptionPolicy: 'source' as const,
      rulePolicy: 'source' as const,
      pricePolicy: 'target' as const,
    };
    await applyInventorySeasonMerge('ws', payload, {
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
