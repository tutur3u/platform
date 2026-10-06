import { expect, it, vi } from 'vitest';
import {
  getWorkspaceAiMemoryItemForEdit,
  updateWorkspaceAiMemoryItem,
} from './ai-memory';

it('reads scoped revisions without cache and preserves authorization', async () => {
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      memory: { id: 'item', content: 'synthetic', revision: 'opaque' },
    }),
  });
  await getWorkspaceAiMemoryItemForEdit('ws/a', 'id/a', {
    baseUrl: 'https://example.test',
    fetch: fetch as typeof globalThis.fetch,
    defaultHeaders: { authorization: 'Bearer synthetic' },
    product: 'mira',
  });
  expect(fetch).toHaveBeenCalledWith(
    'https://example.test/api/v1/workspaces/ws%2Fa/ai/memory/items/id%2Fa?product=mira',
    expect.objectContaining({ cache: 'no-store' })
  );
  expect(
    new Headers(fetch.mock.calls[0]?.[1].headers).get('authorization')
  ).toBe('Bearer synthetic');
});
it('updates the same item with revision and keeps audit failure receipt intact', async () => {
  const receipt = {
    updated: true,
    memory: { id: 'item', content: 'synthetic', revision: 'new' },
    auditRecorded: false,
    warning: 'audit_failed',
  };
  const fetch = vi
    .fn()
    .mockResolvedValue({ ok: true, status: 200, json: async () => receipt });
  expect(
    await updateWorkspaceAiMemoryItem(
      'ws',
      'item',
      { value: 'synthetic', revision: 'old' },
      {
        baseUrl: 'https://example.test',
        fetch: fetch as typeof globalThis.fetch,
        product: 'mira',
      }
    )
  ).toEqual(receipt);
  expect(fetch.mock.calls[0]?.[1]).toMatchObject({
    method: 'PATCH',
    body: JSON.stringify({ value: 'synthetic', revision: 'old' }),
  });
});
