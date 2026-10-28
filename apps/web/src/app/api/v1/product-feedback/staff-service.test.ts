// @vitest-environment node
import { createClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStaffActorResolver } from './staff-access';
import { createStaffAuthTransport } from './staff-auth-transport';
import type { StaffOperationContext } from './staff-operation';
import {
  createFeedbackStaffStore,
  type FeedbackStaffDatabase,
} from './staff-rpc';
import { createFeedbackStaffService } from './staff-service';

const actor = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const date = '2026-10-22T00:00:00.000001Z';
const item = {
  id,
  title: 'Synthetic report',
  createdAt: date,
  status: 'open',
  archivedAt: null,
  revision: 0,
};
const request = (
  suffix = '',
  headers: HeadersInit = { authorization: 'Bearer fixture-user' }
) =>
  new Request(
    `https://feedback.example.test/api/v1/product-feedback${suffix}`,
    { headers }
  );
function fixture(
  options: {
    email?: string;
    confirmed?: boolean;
    onboarding?: unknown;
    ban?: string;
    sqlCode?: string;
    enabled?: boolean;
    anonymous?: boolean;
  } = {}
) {
  const network = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    if (options.sqlCode)
      return Response.json(
        {
          code: options.sqlCode,
          message: 'PRIVATE provider secret',
          details: 'PRIVATE',
        },
        { status: 400 }
      );
    const path = new URL(String(_url)).pathname;
    const payload = path.endsWith('check_product_feedback_staff_eligibility')
      ? { eligible: true }
      : path.endsWith('list_product_feedback_staff')
        ? { items: [item] }
        : {
            ...item,
            body: 'Private report',
            updatedAt: date,
            capabilities: { canManage: false },
          };
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    return Response.json(payload);
  });
  vi.stubGlobal('fetch', network);
  const actorResolver = createStaffActorResolver({
    session: async () => ({
      user: options.anonymous ? null : { id: actor },
      authError: null,
    }),
    app: () => null,
    hasApp: () => false,
    current: async () => ({
      user: {
        id: actor,
        email: options.email ?? 'fixture@tuturuuu.com',
        email_confirmed_at: options.confirmed === false ? null : date,
        identities: [{ provider: 'email', identity_data: {} }],
        banned_until: options.ban ?? null,
        app_metadata: { employee_onboarding: options.onboarding ?? true },
      },
      error: null,
    }),
    now: () => Date.parse(date),
  });
  const store = (operation: StaffOperationContext) =>
    createFeedbackStaffStore(
      createClient<FeedbackStaffDatabase>(
        'https://db.example.test',
        'fixture-service-key',
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
          global: { fetch: createStaffAuthTransport(operation) },
        }
      )
    );
  const service = createFeedbackStaffService({
    actor: actorResolver,
    enabled: () => options.enabled !== false,
    list: (who, query, op) => store(op).list(who, query, op),
    detail: (who, key, op) => store(op).detail(who, key, op),
    eligibility: (who, op) => store(op).eligibility(who, op),
  });
  return { network, service };
}
afterEach(() => vi.unstubAllGlobals());
describe('live staff service composition over a synthetic Auth/SQL boundary', () => {
  it('serializes nullable first-page RPC arguments and returns projected metadata/detail/eligibility', async () => {
    const { service, network } = fixture();
    expect(
      await (await service.eligibility(request('/eligibility'))).json()
    ).toEqual({ eligible: true });
    expect(
      await (await service.list(request('?limit=1&q=Synthetic'))).json()
    ).toEqual({ items: [item], nextCursor: null });
    const list = network.mock.calls.find(([url]) =>
      String(url).endsWith('/list_product_feedback_staff')
    );
    expect(JSON.parse(String(list?.[1]?.body))).toEqual({
      p_actor: actor,
      p_view: 'inbox',
      p_status: null,
      p_query: 'Synthetic',
      p_limit: 1,
      p_before: null,
      p_before_id: null,
    });
    expect(await (await service.detail(request(`/${id}`), id)).json()).toEqual({
      ...item,
      body: 'Private report',
      updatedAt: date,
      capabilities: { canManage: false },
    });
  });
  it.each([
    { email: 'fixture@tuturuuu.com.evil' },
    { email: 'fixture@sub.tuturuuu.com' },
    { email: 'fixture@example.com' },
    { confirmed: false },
    { onboarding: 'true' },
    { onboarding: false },
    { ban: '2099-01-01T00:00:00Z' },
  ])('denies current identity %j before any SQL', async (options) => {
    const { service, network } = fixture(options);
    for (const response of [
      await service.eligibility(request()),
      await service.list(request()),
      await service.detail(request(), id),
    ])
      expect(response.status).toBe(403);
    expect(network).not.toHaveBeenCalled();
  });
  it.each(['PT403', 'PGRST202', 'PT503', '42501'])(
    'maps SQL %s without disclosing diagnostics',
    async (sqlCode) => {
      const { service } = fixture({ sqlCode });
      for (const response of [
        await service.eligibility(request()),
        await service.list(request()),
        await service.detail(request(), id),
      ]) {
        expect(response.status).toBe(sqlCode === 'PT403' ? 403 : 503);
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        expect(await response.text()).not.toMatch(/PRIVATE|provider|secret/);
      }
    }
  );
  it('denies anonymous and malformed explicit credentials; never falls through to cookies', async () => {
    const { service, network } = fixture({ anonymous: true });
    expect((await service.list(request())).status).toBe(401);
    expect(
      (
        await service.list(
          request('', { authorization: 'Basic bad', cookie: 'fixture=valid' })
        )
      ).status
    ).toBe(401);
    expect(network).not.toHaveBeenCalled();
  });
  it('leaves the runtime flag off and suppresses SQL', async () => {
    const { service, network } = fixture({ enabled: false });
    expect((await service.list(request())).status).toBe(503);
    expect((await service.eligibility(request())).status).toBe(503);
    expect(network).not.toHaveBeenCalled();
  });
});
