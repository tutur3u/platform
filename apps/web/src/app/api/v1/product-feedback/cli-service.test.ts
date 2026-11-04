// @vitest-environment node
import { createClient } from '@supabase/supabase-js';
import {
  getAppSessionTokenFromRequest,
  getAppSessionUserFromRequest,
} from '@tuturuuu/auth/app-session';
import { createCliAppSession } from '@tuturuuu/auth/cli-session';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runFeedbackCommand } from '../../../../../../../packages/sdk/src/cli/feedback';
import { TuturuuuUserClient } from '../../../../../../../packages/sdk/src/platform';
import { createStaffActorResolver } from './staff-access';
import { createStaffAuthTransport } from './staff-auth-transport';
import type { StaffOperationContext } from './staff-operation';
import {
  createFeedbackStaffStore,
  type FeedbackStaffDatabase,
} from './staff-rpc';
import { createFeedbackStaffService } from './staff-service';

const actor = '11111111-1111-4111-8111-111111111111';
const id = (n: number) =>
  `22222222-2222-4222-8222-${String(n).padStart(12, '0')}`;
const item = (n: number) => ({
  id: id(n),
  title: `Synthetic ${n}`,
  createdAt: '2026-10-22T00:00:00.000001Z',
  status: 'resolved',
  archivedAt: '2026-10-22T01:00:00Z',
  revision: 3,
});
function fixture(denial?: 'identity' | 'registry' | 'schema') {
  const secret = 'synthetic-feedback-cli-test-signing-key';
  vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', secret);
  const token = createCliAppSession(
    { userId: actor, email: 'stale-token-claim@example.test' },
    { secret }
  ).access.token;
  const rpc = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (denial === 'registry' || denial === 'schema')
      return Response.json(
        {
          code: denial === 'registry' ? 'PT403' : 'PGRST202',
          message: 'PRIVATE_PROVIDER_SECRET',
        },
        { status: 400 }
      );
    const args = JSON.parse(String(init?.body));
    expect(args.p_actor).toBe(actor);
    return Response.json(
      String(url).endsWith('list_product_feedback_staff')
        ? { items: args.p_before_id ? [item(1)] : [item(3), item(2)] }
        : {
            ...item(3),
            body: 'PRIVATE_BODY',
            updatedAt: item(3).createdAt,
            capabilities: { canManage: false },
          }
    );
  });
  vi.stubGlobal('fetch', rpc);
  const resolver = createStaffActorResolver({
    session: async (request) => ({
      user:
        request.headers.get('authorization') === 'Bearer PRIVATE_USER_TOKEN'
          ? { id: actor }
          : null,
      authError: null,
    }),
    app: (request) =>
      getAppSessionUserFromRequest(request, { targetApp: 'platform' }),
    hasApp: (request) => getAppSessionTokenFromRequest(request) !== null,
    current: async () => ({
      user: {
        id: actor,
        email:
          denial === 'identity'
            ? 'staff@tuturuuu.com.evil'
            : 'staff@tuturuuu.com',
        email_confirmed_at: item(3).createdAt,
        identities: [{ provider: 'email', identity_data: {} }],
        app_metadata: { employee_onboarding: true },
      },
      error: null,
    }),
    now: Date.now,
  });
  const store = (op: StaffOperationContext) =>
    createFeedbackStaffStore(
      createClient<FeedbackStaffDatabase>(
        'https://db.example.test',
        'PRIVATE_SERVICE_TOKEN',
        {
          auth: { autoRefreshToken: false, persistSession: false },
          global: { fetch: createStaffAuthTransport(op) },
        }
      )
    );
  const service = createFeedbackStaffService({
    actor: resolver,
    enabled: () => true,
    list: (who, query, op) => store(op).list(who, query, op),
    detail: (who, key, op) => store(op).detail(who, key, op),
    eligibility: (who, op) => store(op).eligibility(who, op),
  });
  const http = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(String(url), init);
    const parts = new URL(request.url).pathname.split('/');
    return parts.length === 4
      ? service.list(request)
      : service.detail(request, parts.at(-1) ?? '');
  });
  const client = new TuturuuuUserClient({
    accessToken: token,
    baseUrl: 'https://web.example.test',
    fetch: http,
  });
  const write = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation(() => true);
  return { client, rpc, http, write };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe('CLI to guarded live staff service composition', () => {
  it('rejects a tampered CLI token before current identity or SQL access', async () => {
    const { http, rpc } = fixture();
    const client = new TuturuuuUserClient({
      accessToken: 'ttr_app_tampered',
      baseUrl: 'https://web.example.test',
      fetch: http,
    });
    await expect(
      runFeedbackCommand({
        client,
        flags: {},
        json: true,
        positionals: ['feedback', 'list'],
      })
    ).rejects.toThrow('feedback_unauthorized (401)');
    expect(rpc).not.toHaveBeenCalled();
  });
  it('passes authenticated archive/status/search/cursor filters through one page at a time', async () => {
    const { client, write, rpc } = fixture();
    const flags = {
      view: 'archive',
      status: 'resolved',
      search: 'Synthetic',
      limit: '1',
    };
    await runFeedbackCommand({
      client,
      flags,
      json: true,
      positionals: ['feedback', 'list'],
    });
    const first = JSON.parse(String(write.mock.calls.at(-1)?.[0]));
    expect(first.items).toEqual([item(3)]);
    expect(first.nextCursor).toBeTypeOf('string');
    await runFeedbackCommand({
      client,
      flags: { ...flags, cursor: first.nextCursor },
      json: true,
      positionals: ['feedback', 'list'],
    });
    expect(JSON.parse(String(write.mock.calls.at(-1)?.[0]))).toEqual({
      items: [item(1)],
      nextCursor: null,
    });
    expect(JSON.parse(String(rpc.mock.calls.at(-1)?.[1]?.body))).toMatchObject({
      p_view: 'archive',
      p_status: 'resolved',
      p_query: 'Synthetic',
      p_limit: 1,
      p_before_id: id(3),
    });
    expect(write.mock.calls.map(String).join('')).not.toMatch(
      /PRIVATE|token|actor/
    );
  });
  it('omits detail content by default and includes it only on explicit opt-in', async () => {
    const { client, write } = fixture();
    await runFeedbackCommand({
      client,
      flags: {},
      json: true,
      positionals: ['feedback', 'show', id(3)],
    });
    expect(String(write.mock.calls.at(-1)?.[0])).not.toMatch(
      /PRIVATE_BODY|TOKEN/
    );
    await runFeedbackCommand({
      client,
      flags: { 'include-content': true },
      json: true,
      positionals: ['feedback', 'show', id(3)],
    });
    expect(JSON.parse(String(write.mock.calls.at(-1)?.[0])).body).toBe(
      'PRIVATE_BODY'
    );
  });
  it.each(['identity', 'registry', 'schema'] as const)(
    'returns sanitized error JSON for %s denial/fault',
    async (denial) => {
      const { client, write, rpc } = fixture(denial);
      let failure: unknown;
      try {
        await runFeedbackCommand({
          client,
          flags: {},
          json: true,
          positionals: ['feedback', 'list'],
        });
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(Error);
      if (!(failure instanceof Error)) throw new Error('missing failure');
      const status = denial === 'schema' ? 503 : 403;
      expect(JSON.parse(failure.message)).toEqual({
        error: {
          code: status === 503 ? 'feedback_unavailable' : 'feedback_forbidden',
          status,
          message: expect.any(String),
        },
      });
      expect(failure.message).not.toMatch(/PRIVATE|TOKEN|provider|https/);
      expect(write).not.toHaveBeenCalled();
      if (denial === 'identity') expect(rpc).not.toHaveBeenCalled();
    }
  );
});
