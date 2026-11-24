import { beforeEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  actor: '00000000-0000-4000-8000-000000000001',
  rpc: vi.fn(),
  schema: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({ schema: f.schema }),
}));
vi.mock('@/lib/api-auth-audiences', () => ({
  getDefaultAppSessionVerificationOptions: () => ({}),
}));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: (request: Request, auth: unknown) => Promise<Response>) =>
    (req: Request) =>
      handler(req, { user: { id: f.actor }, supabase: {} }),
}));

import { PUT } from './route';

const put = (body: unknown) =>
  PUT(
    new Request('https://test/api/v1/users/me/analytics-consent', {
      method: 'PUT',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }) as never,
    {} as never
  );

describe('PUT /api/v1/users/me/analytics-consent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    f.schema.mockReturnValue({ rpc: f.rpc });
    f.rpc.mockResolvedValue({ data: [{ granted: false }], error: null });
  });

  it('records the choice for the verified session user only', async () => {
    const response = await put({
      granted: false,
      source: 'workspace_banner',
      policyVersion: '2026-11-24',
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ granted: false });
    expect(f.schema).toHaveBeenCalledWith('private');
    expect(f.rpc).toHaveBeenCalledWith('record_product_analytics_consent', {
      p_user_id: f.actor,
      p_granted: false,
      p_source: 'workspace_banner',
      p_policy_version: '2026-11-24',
    });
  });

  it('rejects a caller-supplied user, unknown fields and bad input', async () => {
    for (const body of [
      { granted: true, source: 'web_banner', policyVersion: '2026-11-24', userId: 'x' },
      { granted: 'yes', source: 'web_banner', policyVersion: '2026-11-24' },
      { granted: true, source: 'elsewhere', policyVersion: '2026-11-24' },
      { granted: true, source: 'web_banner', policyVersion: ' bad' },
      'not json',
    ]) {
      expect((await put(body)).status).toBe(400);
    }
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it('reports a failed write without leaking the error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    f.rpc.mockResolvedValue({ data: null, error: { code: '23503', message: 'detail' } });
    const response = await put({
      granted: true,
      source: 'web_banner',
      policyVersion: '2026-11-24',
    });
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('detail');
    expect(spy).toHaveBeenCalledWith('Analytics consent write failed', {
      code: '23503',
    });
  });
});
