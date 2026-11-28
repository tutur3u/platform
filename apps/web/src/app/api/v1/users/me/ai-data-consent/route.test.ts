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

import { GET, PUT } from './route';

const url = 'https://test/api/v1/users/me/ai-data-consent';
const put = (body: unknown) =>
  PUT(
    new Request(url, {
      method: 'PUT',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }) as never,
    {} as never
  );

describe('/api/v1/users/me/ai-data-consent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    f.schema.mockReturnValue({ rpc: f.rpc });
  });

  it('reads "not allowed" when the user never answered', async () => {
    f.rpc.mockResolvedValue({ data: [], error: null });
    const response = await GET(new Request(url) as never, {} as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      granted: false,
      provider: 'google_gemini',
      policyVersion: null,
      grantedAt: null,
      withdrawnAt: null,
    });
    expect(f.rpc).toHaveBeenCalledWith('get_ai_data_consent', {
      p_user_id: f.actor,
    });
  });

  it('records an Allow for the verified session user only', async () => {
    f.rpc.mockResolvedValue({
      data: [
        {
          granted: true,
          provider: 'google_gemini',
          policy_version: '2026-11-28',
          granted_at: '2026-11-28T10:00:00Z',
          withdrawn_at: null,
        },
      ],
      error: null,
    });
    const response = await put({
      granted: true,
      source: 'mobile_mira_prompt',
      policyVersion: '2026-11-28',
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      granted: true,
      grantedAt: '2026-11-28T10:00:00Z',
    });
    expect(f.rpc).toHaveBeenCalledWith('record_ai_data_consent', {
      p_user_id: f.actor,
      p_granted: true,
      p_source: 'mobile_mira_prompt',
      p_policy_version: '2026-11-28',
    });
  });

  it('records a revoke from settings', async () => {
    f.rpc.mockResolvedValue({ data: [{ granted: false }], error: null });
    const response = await put({
      granted: false,
      source: 'mobile_settings',
      policyVersion: '2026-11-28',
    });
    expect(await response.json()).toMatchObject({ granted: false });
  });

  it('rejects a caller-supplied user, unknown sources and bad JSON', async () => {
    for (const body of [
      {
        granted: true,
        source: 'mobile_settings',
        policyVersion: '2026-11-28',
        userId: 'someone-else',
      },
      { granted: true, source: 'web_banner', policyVersion: '2026-11-28' },
      { granted: 'yes', source: 'mobile_settings', policyVersion: '1' },
      '{not json',
    ]) {
      const response = await put(body);
      expect(response.status).toBe(400);
    }
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it('fails without echoing a stored decision when the write fails', async () => {
    f.rpc.mockResolvedValue({ data: null, error: { code: '22023' } });
    const response = await put({
      granted: true,
      source: 'mobile_settings',
      policyVersion: '2026-11-28',
    });
    expect(response.status).toBe(500);
  });
});
