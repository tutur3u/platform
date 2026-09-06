import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), rpc: vi.fn() }));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn(),
}));
vi.mock('@/lib/session-api', () => ({
  authorizeAiStudioWorkspaceRequest: mocks.authorize,
}));

import { GET } from './route';

const context = { params: Promise.resolve({ wsId: 'personal' }) };
const request = () =>
  new NextRequest(
    'https://ai.tuturuuu.com/api/v1/workspaces/personal/ai/provider-costs?from=2026-07-01T00:00:00Z&to=2026-08-01T00:00:00Z'
  );
beforeEach(() => {
  mocks.rpc.mockReset().mockResolvedValue({ data: [], error: null });
  mocks.authorize.mockResolvedValue({
    ok: true,
    workspace: { id: 'normalized-workspace' },
    sbAdmin: { schema: () => ({ rpc: mocks.rpc }) },
  });
});
describe('provider cost reads', () => {
  it('authorizes the satellite session and queries only its normalized workspace', async () => {
    const result = await GET(request(), context);
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({
      currency: 'USD',
      timezone: 'UTC',
      rows: [],
    });
    expect(result.headers.get('Cache-Control')).toBe('no-store');
    expect(mocks.authorize).toHaveBeenCalledWith('personal', 'use_ai_studio');
    expect(mocks.rpc).toHaveBeenCalledWith(
      'get_external_provider_costs',
      expect.objectContaining({ p_ws_id: 'normalized-workspace' })
    );
  });
  it.each(['?from=invalid&to=invalid', '?from=2026-08-01&to=2026-07-01'])(
    'rejects invalid ranges without querying costs: %s',
    async (query) => {
      const result = await GET(
        new NextRequest(
          `https://ai.tuturuuu.com/api/v1/workspaces/personal/ai/provider-costs${query}`
        ),
        context
      );
      expect(result.status).toBe(400);
      expect(mocks.rpc).not.toHaveBeenCalled();
    }
  );
  it('does not query costs when access is refused', async () => {
    mocks.authorize.mockResolvedValue({
      ok: false,
      response: Response.json({ error: 'Forbidden' }, { status: 403 }),
    });
    expect((await GET(request(), context)).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('reports unavailable schema as an error rather than a zero cost', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } });
    expect((await GET(request(), context)).status).toBe(503);
  });
});
