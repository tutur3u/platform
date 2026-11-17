import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CitationAiError } from '@/lib/cite/ai/contracts';
import { POST } from './route';

const mocks = vi.hoisted(() => ({
  wrapped: [] as { handler: unknown; options: unknown }[],
  fix: vi.fn(),
  createService: vi.fn(),
  createGrounding: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: (handler: unknown, options: unknown) => {
    mocks.wrapped.push({ handler, options });
    return (request: Request) =>
      (handler as (r: Request, a: unknown) => unknown)(request, {
        supabase: {},
        user: { id: 'user-1' },
      });
  },
}));
vi.mock('@/lib/cite/ai/grounding', () => ({
  createCitationAiGrounding: mocks.createGrounding,
}));
vi.mock('@/lib/cite/ai/runtime', () => ({
  createSessionCitationAiService: mocks.createService,
}));

const request = (body: unknown, type = 'application/json') =>
  new Request('https://tuturuuu.com/api/v1/cite/ai/fix-ref', {
    method: 'POST',
    headers: { 'content-type': type },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  mocks.fix.mockReset();
  mocks.createGrounding.mockReset();
  mocks.createGrounding.mockReturnValue({
    ground: vi.fn(),
    reserveGrounding: vi.fn(),
  });
  mocks.createService.mockReset();
  mocks.createService.mockReturnValue({ fix: mocks.fix });
});

describe('POST /api/v1/cite/ai/fix-ref', () => {
  it('is wrapped in session auth with a bounded payload', () => {
    expect(mocks.wrapped).toHaveLength(1);
    expect(mocks.wrapped[0]?.options).toEqual({
      allowAppSessionAuth: true,
      maxPayloadSize: 96000,
    });
  });

  it('passes the authenticated actor, never a body-supplied identity, to the service', async () => {
    mocks.fix.mockResolvedValue({ operationId: 'op' });
    const response = await POST(
      request({ input: 'x', userId: 'attacker' }) as never
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.createGrounding).toHaveBeenCalledExactlyOnceWith('user-1');
    expect(mocks.fix.mock.calls[0]?.[0]).toBe('user-1');
  });

  it('refuses a non-JSON body before invoking the service', async () => {
    const response = await POST(request({}, 'text/plain') as never);
    expect(response.status).toBe(400);
    expect(mocks.fix).not.toHaveBeenCalled();
  });

  it('maps a credit refusal to a fixed category with no provider detail', async () => {
    mocks.fix.mockRejectedValue(new CitationAiError('CREDITS_EXHAUSTED', 403));
    const response = await POST(request({ input: 'x' }) as never);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'CREDITS_EXHAUSTED' });
  });
});
