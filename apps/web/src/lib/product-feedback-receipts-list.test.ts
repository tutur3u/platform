// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listProductFeedbackReceipts } from './product-feedback-service';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  request: vi.fn(),
  session: vi.fn(),
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

const actor = '11111111-1111-4111-8111-111111111111';
const first = {
  id: '22222222-2222-4222-8222-222222222222',
  createdAt: '2026-11-24T05:00:00.123456+00:00',
  title: 'Bug Report - Web Dashboard',
};
const get = (
  query = '',
  headers: HeadersInit = { authorization: 'Bearer user' }
) =>
  new Request(
    `https://web.example.test/api/v1/product-feedback/receipts${query}`,
    {
      headers,
    }
  );
let data: unknown;
let error: { code: string; message: string } | null;
const sql = vi.fn((_name: string, _args: Record<string, unknown>) => ({
  abortSignal: vi.fn(async () => ({ data, error })),
}));

beforeEach(() => {
  data = { items: [first], hasMore: false };
  error = null;
  mocks.admin.mockResolvedValue({
    auth: {
      admin: {
        getUserById: vi.fn(async () => ({
          data: { user: { id: actor, banned_until: null } },
          error: null,
        })),
      },
    },
    rpc: vi.fn(),
  });
  mocks.request.mockResolvedValue({ rpc: sql });
  mocks.session.mockResolvedValue({ user: { id: actor }, authError: null });
});
afterEach(() => {
  vi.resetAllMocks();
});

describe('own feedback receipt listing', () => {
  it('lists through the caller-scoped client without any actor argument', async () => {
    const response = await listProductFeedbackReceipts(get());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [first], nextCursor: null });
    expect(sql).toHaveBeenCalledExactlyOnceWith(
      'list_product_feedback_receipts',
      {}
    );
    expect(mocks.admin).toHaveBeenCalledTimes(1);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('returns only receipt fields and rejects rows carrying anything else', async () => {
    data = {
      items: [{ ...first, actor_id: '99999999-9999-4999-8999-999999999999' }],
      hasMore: false,
    };
    expect((await listProductFeedbackReceipts(get())).status).toBe(503);
  });

  it('passes the page size and the keyset cursor, and emits the next cursor', async () => {
    data = { items: [first], hasMore: true };
    const cursor = `2026-11-24T06:00:00+00:00_${actor}`;
    const response = await listProductFeedbackReceipts(
      get(`?limit=20&cursor=${encodeURIComponent(cursor)}`)
    );
    expect(sql).toHaveBeenCalledWith('list_product_feedback_receipts', {
      p_limit: 20,
      p_cursor_created_at: '2026-11-24T06:00:00+00:00',
      p_cursor_id: actor,
    });
    expect((await response.json()).nextCursor).toBe(
      `${first.createdAt}_${first.id}`
    );
  });

  it.each([
    '?limit=0',
    '?limit=51',
    '?limit=abc',
    '?cursor=nope',
    `?cursor=2026-11-24_${actor}`,
    '?q=probe',
    '?actor=other',
  ])('rejects malformed query %s', async (query) => {
    expect((await listProductFeedbackReceipts(get(query))).status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  it('answers 401 without a signed-in user', async () => {
    mocks.session.mockResolvedValue({ user: null, authError: null });
    const response = await listProductFeedbackReceipts(get('', {}));
    expect(response.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('answers 401 for a satellite app token that is not a user session', async () => {
    const response = await listProductFeedbackReceipts(
      get('', { authorization: 'Bearer ttr_app_token' })
    );
    expect(response.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('maps SQL failures to a sanitized 503', async () => {
    data = null;
    error = { code: 'XX000', message: 'PRIVATE_DETAIL' };
    const response = await listProductFeedbackReceipts(get());
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain('PRIVATE');
  });
});
