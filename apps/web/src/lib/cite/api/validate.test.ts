import { NextRequest } from 'next/server';
import { CiteWorkSchema, validateCitation } from '@tuturuuu/cite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './validate';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  options: vi.fn(),
  store: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (
      handler: (r: Request, a: unknown) => Promise<Response>,
      options: unknown
    ) =>
    async (request: Request) => {
      mocks.options(options);
      const session = await mocks.auth(request);
      return session.ok
        ? handler(request, { user: session.user, supabase: {} })
        : session.response;
    },
}));
vi.mock('@/lib/cite/runtime-db', () => ({
  getCitationRuntimeDb: mocks.store,
}));
const work = CiteWorkSchema.parse({
  id: 'synthetic-web',
  type: 'webpage',
  title: 'Synthetic tides',
  provenance: {
    sourceCaptureMethod: 'ai_parsed',
    verificationStatus: 'ai_inferred',
  },
});
function request(style: 'apa' | 'harvard') {
  return new NextRequest('https://tuturuuu.com/api/v1/cite/validate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ style, work }),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ ok: true, user: { id: 'verified-actor' } });
  mocks.store.mockResolvedValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
});
describe('POST /api/v1/cite/validate', () => {
  it.each(['apa', 'harvard'] as const)(
    'matches portable %s source requirements and provenance warnings',
    async (style) => {
      const input = request(style);
      const response = await POST(input);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        issues: validateCitation(work, style),
      });
      expect(mocks.auth).toHaveBeenCalledWith(input);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
    }
  );
  it('shares the actor/global formatting budget and returns Retry-After', async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    const response = await POST(request('harvard'));
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: 'RATE_LIMITED' });
    expect(response.headers.get('retry-after')).toMatch(/^\d+$/);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('reserve_cite_budget', {
      p_scope: 'format',
      p_actor_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      p_window: expect.any(Number),
      p_actor_limit: 10,
      p_global_limit: 120,
    });
  });
  it('requires a current authenticated actor', async () => {
    mocks.auth.mockResolvedValue({
      ok: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    });
    expect((await POST(request('apa'))).status).toBe(401);
    expect(mocks.store).not.toHaveBeenCalled();
  });
  it('runs behind the session wrapper with a bounded payload', async () => {
    await POST(request('apa'));
    expect(mocks.options).toHaveBeenCalledWith({
      allowAppSessionAuth: true,
      maxPayloadSize: 96 * 1024,
    });
  });
});
