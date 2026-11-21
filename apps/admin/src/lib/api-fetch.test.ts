import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from './api-fetch';

const baseGlobal = globalThis as { __tuturuuuAppBase?: string };

afterEach(() => {
  delete baseGlobal.__tuturuuuAppBase;
  vi.unstubAllGlobals();
});

describe('apiFetch mount resolution', () => {
  it('prefixes an owned string path and still parses JSON', async () => {
    baseGlobal.__tuturuuuAppBase = '/admin';
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ models: [] }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/api/v1/admin/ai-credits/models')).resolves.toEqual({
      models: [],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/admin/api/v1/admin/ai-credits/models',
      undefined
    );
  });

  it('leaves a Web passthrough string at the root', async () => {
    baseGlobal.__tuturuuuAppBase = '/admin';
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/api/workspaces/invitations');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/workspaces/invitations',
      undefined
    );
  });
});
