// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readProductFeedbackReceipt,
  readProductFeedbackStaffMedia,
  submitProductFeedbackRequest,
} from './product-feedback-service';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  request: vi.fn(),
  session: vi.fn(),
  staff: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/supabase/request/server', () => ({
  createRequestClient: mocks.request,
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.session,
}));
vi.mock('@/app/api/v1/product-feedback/staff-access', async (load) => ({
  ...(await load<
    typeof import('@/app/api/v1/product-feedback/staff-access')
  >()),
  resolveStaffActor: mocks.staff,
}));
const actor = '11111111-1111-4111-8111-111111111111';
const key = '33333333-3333-4333-8333-333333333333';
const receipt = {
  id: '22222222-2222-4222-8222-222222222222',
  createdAt: '2026-10-22T00:00:00Z',
};
const request = (
  headers: HeadersInit = { authorization: 'Bearer fixture-user' }
) =>
  new Request('https://web.example.test/api/v1/product-feedback', {
    headers,
    method: 'POST',
    body: JSON.stringify({
      title: 'Subject',
      body: 'Details',
      idempotencyKey: key,
      turnstileToken: 'PRIVATE_TOKEN',
    }),
  });
let current = { id: actor, banned_until: null as string | null };
let data: unknown;
let error: { code: string; message: string } | null;
const sql = vi.fn(() => ({
  abortSignal: vi.fn(async () => ({ data, error })),
}));
beforeEach(() => {
  current = { id: actor, banned_until: null };
  data = { status: 'accepted', receipt };
  error = null;
  mocks.admin.mockResolvedValue({
    auth: {
      admin: {
        getUserById: vi.fn(async () => ({
          data: { user: current },
          error: null,
        })),
      },
    },
    rpc: sql,
  });
  mocks.request.mockResolvedValue({ rpc: sql });
  mocks.session.mockResolvedValue({ user: { id: actor }, authError: null });
  mocks.staff.mockResolvedValue(actor);
  vi.stubEnv('PRODUCT_FEEDBACK_SUBMISSION_ENABLED', 'true');
  vi.stubEnv('PRODUCT_FEEDBACK_MEDIA_ENABLED', 'true');
  vi.stubEnv('PRODUCT_FEEDBACK_STAFF_INBOX_ENABLED', 'true');
  vi.stubEnv('TURNSTILE_SECRET_KEY', 'PRIVATE_SECRET');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ success: true }))
  );
});
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe('active feedback Web service boundaries', () => {
  it('binds the authenticated actor to canonical text SQL and does not trust forwarded quota identity', async () => {
    const req = request();
    req.headers.set('content-type', 'application/json');
    req.headers.set('x-forwarded-for', 'spoofed');
    expect((await submitProductFeedbackRequest(req)).status).toBe(201);
    expect(sql).toHaveBeenCalledWith('submit_product_feedback', {
      p_actor: actor,
      p_key: key,
      p_title: 'Subject',
      p_body: 'Details',
    });
    const verify = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(String(verify?.body)).not.toContain('remoteip');
  });
  it.each(['Basic invalid', 'Bearer ttr_app_unaccepted'])(
    'rejects explicit %s without cookie fallback',
    async (authorization) => {
      expect(
        (
          await submitProductFeedbackRequest(
            request({ authorization, cookie: 'fixture=valid' })
          )
        ).status
      ).toBe(401);
      expect(mocks.request).not.toHaveBeenCalled();
      expect(sql).not.toHaveBeenCalled();
    }
  );
  it('rechecks a current ban before Turnstile or writes', async () => {
    current.banned_until = '2099-01-01T00:00:00Z';
    expect((await submitProductFeedbackRequest(request())).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
    expect(sql).not.toHaveBeenCalled();
  });
  it('never bypasses Turnstile in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ success: false }))
    );
    const req = request();
    req.headers.set('content-type', 'application/json');
    expect((await submitProductFeedbackRequest(req)).status).toBe(403);
    expect(sql).not.toHaveBeenCalled();
  });
  it('observes only an owner receipt on the request-scoped client without submitting again', async () => {
    data = receipt;
    const response = await readProductFeedbackReceipt(
      new Request(
        `https://web.example.test/api/v1/product-feedback/receipts/${key}`,
        { headers: { authorization: 'Bearer fixture-user' } }
      ),
      key
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ receipt });
    expect(sql).toHaveBeenCalledExactlyOnceWith(
      'get_product_feedback_receipt',
      { p_key: key }
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['PT403', 'PGRST202'])(
    'sanitizes private media SQL %s',
    async (code) => {
      error = { code, message: 'PRIVATE_SERVICE_TOKEN' };
      data = null;
      const response = await readProductFeedbackStaffMedia(
        new Request(
          'https://web.example.test/api/v1/product-feedback/' +
            receipt.id +
            '/media'
        ),
        receipt.id
      );
      expect(response.status).toBe(code === 'PT403' ? 403 : 503);
      expect(await response.text()).not.toContain('PRIVATE');
      expect(mocks.staff).toHaveBeenCalledOnce();
    }
  );
  it('returns a private media projection without paths, credentials or reporter identity', async () => {
    data = { contentType: 'image/webp', data: 'UklGRgAAAABXRUJQ' };
    const response = await readProductFeedbackStaffMedia(
      new Request(
        'https://web.example.test/api/v1/product-feedback/' +
          receipt.id +
          '/media'
      ),
      receipt.id
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ media: data });
    expect(sql).toHaveBeenCalledWith('get_product_feedback_media_staff', {
      p_actor: actor,
      p_id: receipt.id,
    });
  });
});
