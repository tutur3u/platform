import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
} from 'node:crypto';
import {
  fleetThreadMachinesSchema,
  fleetThreadMessagesSchema,
  fleetThreadPageSchema,
  fleetThreadProjectsSchema,
} from '@tuturuuu/internal-api/mastermind-threads';
import { MastermindBridgeError } from '@tuturuuu/utils/mastermind-store/bridge-client';
import {
  BRIDGE_RPC_KEY_INFO,
  type BridgeRpcRequest,
  bridgeRpcRequestSchema,
  bridgeRpcSealContext,
  bridgeRpcSigningString,
} from '@tuturuuu/utils/mastermind-store/bridge-protocol';
import { createMemoryMastermindStore } from '@tuturuuu/utils/mastermind-store/client';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { markSeen, readSeen } from '@/lib/mastermind/fleet/thread-reads';

vi.mock('server-only', () => ({}));

const OWNER = '11111111-1111-4111-8111-111111111111';
const STRANGER = '33333333-3333-4333-8333-333333333333';
// A stand-in fleet signing value, padded to a usable length.
const SECRET = 'fleet-test-'.padEnd(44, 'f');
const THREAD = 'thread:project:mcp%3Aabc:1234';
const BASE = 'https://tuturuuu.com/api/v1/mastermind/fleet/threads';

type Sent = { request: BridgeRpcRequest; sig: string };

const mocks = vi.hoisted(() => ({
  user: { id: '' },
  account: { status: 'allowed' } as { status: string },
  accountCheck: vi.fn(),
  granted: [] as string[],
  store: null as unknown,
  /** What the machine answers, before sealing. */
  answer: null as unknown,
  sent: [] as unknown[],
  rpc: null as unknown,
  configured: true,
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: (r: Request, a: unknown, p: unknown) => Response) =>
    async (request: Request, context?: { params?: unknown }) =>
      handler(
        request,
        { user: mocks.user, supabase: { auth: {} } },
        await context?.params
      ),
}));
vi.mock('@tuturuuu/auth/app-session-core', () => ({
  getAppSessionTokenFromRequest: () => null,
}));
vi.mock('@tuturuuu/utils/required-mfa-request', () => ({
  checkRequiredAccountMfa: (...args: unknown[]) => {
    mocks.accountCheck(...args);
    return Promise.resolve(mocks.account);
  },
}));
vi.mock('@tuturuuu/supabase/next/server', async () => ({
  createAdminClient: async () => ({}),
  // The real predicate, so the tests read the credential as production does.
  getBearerAccessToken: (
    await vi.importActual<typeof import('@tuturuuu/supabase/next/server')>(
      '@tuturuuu/supabase/next/server'
    )
  ).getBearerAccessToken,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: async () => ({
    containsPermission: (p: string) => mocks.granted.includes(p),
  }),
}));
vi.mock('@/lib/mastermind/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mastermind/store')>()),
  getMastermindStore: async () => mocks.store,
}));
vi.mock(
  '@tuturuuu/utils/mastermind-store/bridge-client',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@tuturuuu/utils/mastermind-store/bridge-client')
    >()),
    configuredMastermindBridge: () =>
      mocks.configured ? { rpc: mocks.rpc } : null,
  })
);

const key = (secret = SECRET) =>
  Buffer.from(
    hkdfSync('sha256', secret, Buffer.alloc(0), BRIDGE_RPC_KEY_INFO, 32)
  );

/** What the machine does with a request: open the arguments, seal the answer. */
function machine(
  secret = SECRET,
  answerFor?: (r: BridgeRpcRequest) => BridgeRpcRequest
) {
  return async (input: Sent) => {
    mocks.sent.push(input);
    const { request } = input;
    const sealedFor = answerFor ? answerFor(request) : request;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key(secret), iv);
    cipher.setAAD(
      Buffer.from(
        bridgeRpcSealContext('res', sealedFor.id, sealedFor.machineId)
      )
    );
    const data = Buffer.concat([
      cipher.update(JSON.stringify(mocks.answer), 'utf8'),
      cipher.final(),
      cipher.getAuthTag(),
    ]);
    return { iv: iv.toString('base64url'), data: data.toString('base64url') };
  };
}

/** The arguments Web sealed into a request, as the machine would read them. */
function openArgs({ request }: Sent) {
  const data = Buffer.from(request.box.data, 'base64url');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key(),
    Buffer.from(request.box.iv, 'base64url')
  );
  decipher.setAAD(
    Buffer.from(bridgeRpcSealContext('req', request.id, request.machineId))
  );
  decipher.setAuthTag(data.subarray(data.length - 16));
  return JSON.parse(
    Buffer.concat([
      decipher.update(data.subarray(0, data.length - 16)),
      decipher.final(),
    ]).toString('utf8')
  );
}

const thread = (over: Record<string, unknown> = {}) => ({
  threadId: THREAD,
  title: 'Fix the build',
  projectId: 'p1',
  project: 'Platform',
  state: 'running',
  updatedAt: '2026-11-21T05:00:00.000Z',
  itemCount: 12,
  ...over,
});

const get = async (
  route: Promise<{ GET: (r: NextRequest, c: never) => Promise<Response> }>,
  url: string
) => {
  const response = await (
    await route
  ).GET(new NextRequest(url), {
    params: Promise.resolve({}),
  } as never);
  return {
    status: response.status,
    body: await response.json(),
    cache: response.headers.get('cache-control'),
  };
};
const threads = (query: string) =>
  get(import('./threads/route'), `${BASE}?${query}`);
const messages = (query: string) =>
  get(import('./threads/messages/route'), `${BASE}/messages?${query}`);
const machines = (query: string) =>
  get(import('./threads/machines/route'), `${BASE}/machines?${query}`);
const projects = (query: string) =>
  get(import('./threads/projects/route'), `${BASE}/projects?${query}`);

beforeEach(() => {
  vi.stubEnv('MASTERMIND_FLEET_PUBLISHER_SECRET', SECRET);
  vi.stubEnv('MASTERMIND_FLEET_OWNER_IDS', OWNER);
  mocks.user = { id: OWNER };
  mocks.account = { status: 'allowed' };
  mocks.accountCheck.mockClear();
  mocks.granted = ['manage_mastermind', 'view_infrastructure'];
  mocks.store = createMemoryMastermindStore();
  mocks.sent = [];
  mocks.configured = true;
  mocks.rpc = machine();
  mocks.answer = {
    ok: true,
    data: { threads: [thread()], nextCursor: 50, total: 76 },
  };
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('GET /api/v1/mastermind/fleet/threads', () => {
  it('asks the machine with sealed, signed arguments and returns its page', async () => {
    const { status, body } = await threads(
      'machineId=skr-m4&environmentId=env-2&q=%20build%20&cursor=50&limit=20'
    );
    expect(status).toBe(200);
    expect(body).toEqual({
      machineId: 'skr-m4',
      environmentId: 'env-2',
      threads: [thread()],
      nextCursor: 50,
      total: 76,
    });
    const sent = mocks.sent[0] as Sent;
    expect(bridgeRpcRequestSchema.safeParse(sent.request).success).toBe(true);
    expect(sent.request).toMatchObject({
      machineId: 'skr-m4',
      kind: 'threads',
    });
    expect(sent.request.expiresAt - sent.request.issuedAt).toBe(30_000);
    // Nothing readable leaves Web: the store sees ciphertext and a signature.
    expect(JSON.stringify(sent)).not.toContain('build');
    expect(openArgs(sent)).toEqual({
      environmentId: 'env-2',
      query: 'build',
      cursor: 50,
      limit: 20,
    });
    expect(sent.sig).toBe(
      createHmac('sha256', SECRET)
        .update(bridgeRpcSigningString(sent.request))
        .digest('hex')
    );
    expect(bridgeRpcSigningString(sent.request)).toMatch(
      /^mastermind-fleet-rpc-v1\n/
    );
  });

  it('admits only the fleet owner, and only while the account check allows', async () => {
    mocks.user = { id: STRANGER };
    expect((await threads('machineId=skr-m4')).status).toBe(403);
    expect((await projects('machineId=skr-m4')).status).toBe(403);
    mocks.user = { id: OWNER };
    mocks.granted = [];
    expect((await threads('machineId=skr-m4')).status).toBe(403);
    expect(mocks.accountCheck).not.toHaveBeenCalled();
    mocks.granted = ['manage_mastermind', 'view_infrastructure'];
    for (const [account, status, error] of [
      [{ status: 'required' }, 401, 'mfa_required'],
      [{ status: 'invalid' }, 401, 'mfa_required'],
      [{ status: 'unavailable' }, 503, 'unavailable'],
    ] as const) {
      mocks.account = account;
      for (const read of [threads, messages, machines, projects]) {
        const refused = await read(`machineId=skr-m4&threadId=${THREAD}`);
        expect([refused.status, refused.body]).toEqual([status, { error }]);
      }
    }
    expect(mocks.accountCheck.mock.calls[0]![2]).toEqual({ userId: OWNER });
    expect(mocks.sent).toHaveLength(0);
  });

  it('rejects malformed queries before anything is sent', async () => {
    for (const query of [
      '',
      'machineId=../x',
      'machineId=skr-m4&environmentId=-e',
      'machineId=skr-m4&cursor=-1',
      'machineId=skr-m4&cursor=abc',
      'machineId=skr-m4&limit=0',
      'machineId=skr-m4&limit=51',
      `machineId=skr-m4&q=${'x'.repeat(101)}`,
      'machineId=skr-m4&projectId=bad%20id',
      `machineId=skr-m4&projectId=${'p'.repeat(401)}`,
      'machineId=skr-m4&state=done',
      'machineId=skr-m4&include=everything',
    ])
      expect((await threads(query)).body).toEqual({ error: 'invalid_query' });
    expect(mocks.sent).toHaveLength(0);
  });

  it('says which state the machine is in when it cannot answer', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (const [code, status, error] of [
      ['offline', 503, 'machine_offline'],
      ['timeout', 504, 'timeout'],
      ['rate_limited', 429, 'rate_limited'],
      ['budget', 429, 'rate_limited'],
      ['unavailable', 503, 'unconfigured'],
    ] as const) {
      mocks.rpc = async () => {
        throw new MastermindBridgeError(code);
      };
      const failed = await threads('machineId=skr-m4');
      expect([failed.status, failed.body]).toEqual([status, { error }]);
    }
    mocks.configured = false;
    expect((await threads('machineId=skr-m4')).status).toBe(503);
    mocks.configured = true;
    vi.stubEnv('MASTERMIND_FLEET_PUBLISHER_SECRET', '');
    expect((await threads('machineId=skr-m4')).status).toBe(503);
  });

  it('refuses an answer the machine did not seal for this request, or that does not fit', async () => {
    // Sealed under another key, or for another request or machine.
    for (const forged of [
      machine('another-secret-another-secret-123456'),
      machine(SECRET, (request) => ({ ...request, id: OWNER })),
      machine(SECRET, (request) => ({ ...request, machineId: 'other' })),
      async () => ({ iv: 'A'.repeat(16), data: 'x'.repeat(64) }),
      // The request's own sealed arguments, handed back as if they were the answer.
      async (input: Sent) => input.request.box,
    ]) {
      mocks.rpc = forged;
      const refused = await threads('machineId=skr-m4');
      expect([refused.status, refused.body]).toEqual([
        502,
        { error: 'invalid_answer' },
      ]);
    }
    mocks.rpc = machine();
    for (const misshaped of [
      { ok: true, data: { threads: [thread({ state: 'exploding' })] } },
      {
        ok: true,
        data: {
          threads: [{ ...thread(), secret: undefined, threadId: 'bad id' }],
          nextCursor: null,
          total: 1,
        },
      },
      { ok: true },
      { ok: false, code: 'made_up' },
      'text',
    ]) {
      mocks.answer = misshaped;
      expect((await threads('machineId=skr-m4')).status).toBe(502);
    }
    // Fields outside the closed shape never reach the client.
    mocks.answer = {
      ok: true,
      data: {
        threads: [thread({ worktreePath: '/Users/x/secret' })],
        nextCursor: null,
        total: 1,
      },
    };
    const { body } = await threads('machineId=skr-m4');
    expect(JSON.stringify(body)).not.toContain('worktreePath');
  });

  it('shows how far each thread was read, once a marker exists', async () => {
    const read = await import('./threads/read/route');
    const mark = async (body: Record<string, unknown>) => {
      const response = await read.POST(
        new NextRequest(`${BASE}/read`, {
          method: 'POST',
          body: JSON.stringify(body),
        }),
        { params: Promise.resolve({}) } as never
      );
      return { status: response.status, body: await response.json() };
    };
    expect(
      (await threads('machineId=skr-m4')).body.threads[0]
    ).not.toHaveProperty('seenItemCount');
    expect(
      await mark({ machineId: 'skr-m4', threadId: THREAD, itemCount: 9 })
    ).toEqual({ status: 200, body: { saved: true } });
    expect(
      (await threads('machineId=skr-m4')).body.threads[0].seenItemCount
    ).toBe(9);
    // A marker belongs to one machine and environment, and never moves back.
    expect(
      (await threads('machineId=skr-m4&environmentId=env-2')).body.threads[0]
    ).not.toHaveProperty('seenItemCount');
    await mark({ machineId: 'skr-m4', threadId: THREAD, itemCount: 4 });
    expect(
      (await threads('machineId=skr-m4')).body.threads[0].seenItemCount
    ).toBe(9);
    for (const bad of [
      { machineId: 'skr-m4', threadId: 'bad id', itemCount: 1 },
      { machineId: 'skr-m4', threadId: THREAD, itemCount: -1 },
      { machineId: 'skr-m4', threadId: THREAD, itemCount: 1, text: 'x' },
    ])
      expect((await mark(bad)).status).toBe(422);
    mocks.user = { id: STRANGER };
    expect(
      (await mark({ machineId: 'skr-m4', threadId: THREAD, itemCount: 99 }))
        .status
    ).toBe(403);
    // An account the policy no longer accepts cannot move a marker either.
    mocks.user = { id: OWNER };
    for (const [account, status] of [
      [{ status: 'required' }, 401],
      [{ status: 'invalid' }, 401],
      [{ status: 'unavailable' }, 503],
    ] as const) {
      mocks.account = account;
      expect(
        (await mark({ machineId: 'skr-m4', threadId: THREAD, itemCount: 99 }))
          .status
      ).toBe(status);
    }
    mocks.account = { status: 'allowed' };
    expect(
      (await threads('machineId=skr-m4')).body.threads[0].seenItemCount
    ).toBe(9);
    // Without the store the list still stands, just without markers.
    mocks.user = { id: OWNER };
    mocks.store = null;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect((await threads('machineId=skr-m4')).status).toBe(200);
  });
});

describe('projects and thread filters', () => {
  it('seals the project, state and owner-reply filters and returns the reply times', async () => {
    mocks.answer = {
      ok: true,
      data: {
        threads: [thread({ lastOwnerReplyAt: '2026-11-21T04:30:00.000Z' })],
        nextCursor: null,
        total: 1,
      },
    };
    const { status, body } = await threads(
      'machineId=skr-m4&projectId=p1&state=failed&include=ownerReply'
    );
    expect(status).toBe(200);
    // The typed client accepts what the route answers.
    expect(fleetThreadPageSchema.safeParse(body).success).toBe(true);
    expect(body.threads[0].lastOwnerReplyAt).toBe('2026-11-21T04:30:00.000Z');
    expect(openArgs(mocks.sent[0] as Sent)).toEqual({
      limit: 50,
      projectId: 'p1',
      state: 'failed',
      ownerReply: true,
    });
    // Threads in no project, on the bridge machine.
    await threads('machineId=skr-m4&projectId=none');
    expect(openArgs(mocks.sent[1] as Sent)).toEqual({
      limit: 50,
      projectId: 'none',
    });
  });

  it('filters a linked machine by project and state, without asking it for reply times', async () => {
    await threads(
      'machineId=skr-m4&environmentId=env-2&projectId=p1&state=running&include=ownerReply'
    );
    expect(openArgs(mocks.sent[0] as Sent)).toEqual({
      environmentId: 'env-2',
      limit: 50,
      projectId: 'p1',
      state: 'running',
    });
    // "In no project" cannot be asked of a linked machine.
    const none = await threads(
      'machineId=skr-m4&environmentId=env-2&projectId=none'
    );
    expect([none.status, none.body]).toEqual([
      422,
      { error: 'unsupported_for_linked_machine' },
    ]);
    expect(mocks.sent).toHaveLength(1);
  });

  it('returns the projects of the bridge machine with a count per state', async () => {
    const counts = { running: 1, waiting: 0, failed: 2, idle: 40 };
    const data = {
      projects: [
        {
          projectId: 'p1',
          project: 'Platform',
          threadCount: 43,
          counts,
          latestUpdatedAt: '2026-11-21T05:00:00.000Z',
        },
      ],
      unassigned: {
        threadCount: 0,
        counts: { running: 0, waiting: 0, failed: 0, idle: 0 },
      },
      total: 1,
    };
    mocks.answer = { ok: true, data };
    const { status, body, cache } = await projects('machineId=skr-m4');
    expect([status, body]).toEqual([200, { machineId: 'skr-m4', ...data }]);
    // Neither an answer nor a refusal may be kept by a cache on the way.
    expect(cache).toBe('private, no-store');
    expect(fleetThreadProjectsSchema.safeParse(body).success).toBe(true);
    const sent = mocks.sent[0] as Sent;
    expect(sent.request.kind).toBe('projects');
    expect(openArgs(sent)).toEqual({});

    // Only the bridge machine is grouped, and only a well-formed machine id is asked.
    const linked = await projects('machineId=skr-m4&environmentId=env-2');
    expect([linked.status, linked.body, linked.cache]).toEqual([
      422,
      { error: 'unsupported_for_linked_machine' },
      'private, no-store',
    ]);
    expect((await projects('machineId=../x')).body).toEqual({
      error: 'invalid_query',
    });
    expect(mocks.sent).toHaveLength(1);

    // An answer that is not a project list is refused, not passed on.
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocks.answer = {
      ok: true,
      data: { ...data, projects: [{ projectId: 'p1' }] },
    };
    expect((await projects('machineId=skr-m4')).status).toBe(502);
    mocks.answer = { ok: false, code: 'unavailable' };
    expect((await projects('machineId=skr-m4')).status).toBe(503);
  });
});

describe('thread history and machines', () => {
  it('returns one page of history for an existing thread', async () => {
    mocks.answer = {
      ok: true,
      data: {
        thread: thread(),
        messages: [
          {
            position: 30,
            role: 'user',
            text: 'run it',
            truncated: false,
            at: 't1',
          },
          {
            position: 33,
            role: 'assistant',
            text: 'done',
            truncated: false,
            at: 't2',
          },
        ],
        earlierPosition: 29,
      },
    };
    const { status, body } = await messages(
      `machineId=skr-m4&threadId=${encodeURIComponent(THREAD)}&before=40&limit=10`
    );
    expect(status).toBe(200);
    expect(body).toMatchObject({
      machineId: 'skr-m4',
      thread: { threadId: THREAD },
      earlierPosition: 29,
    });
    expect(body.messages).toHaveLength(2);
    expect(fleetThreadMessagesSchema.safeParse(body).success).toBe(true);
    const sent = mocks.sent[0] as Sent;
    expect(sent.request.kind).toBe('transcript');
    // The id reaches the machine exactly as the thread is named, `%3A` included.
    expect(openArgs(sent)).toEqual({ threadId: THREAD, before: 40, limit: 10 });

    mocks.answer = { ok: false, code: 'unknown_thread' };
    const missing = await messages(
      `machineId=skr-m4&threadId=${encodeURIComponent(THREAD)}`
    );
    expect([missing.status, missing.body]).toEqual([
      404,
      { error: 'unknown_thread' },
    ]);
    for (const query of [
      'machineId=skr-m4',
      'machineId=skr-m4&threadId=--json',
      `machineId=skr-m4&threadId=${encodeURIComponent(THREAD)}&limit=31`,
      `machineId=skr-m4&threadId=${encodeURIComponent(THREAD)}&before=x`,
    ])
      expect((await messages(query)).status).toBe(422);
  });

  it('lists the machines reachable through a bridge machine', async () => {
    mocks.answer = {
      ok: true,
      data: {
        machines: [
          { label: 'This machine', reachable: true },
          { environmentId: 'env-2', label: 'MacStudio1', reachable: false },
        ],
      },
    };
    const listed = (await machines('machineId=skr-m4')).body;
    expect(listed).toEqual({
      machineId: 'skr-m4',
      machines: [
        { label: 'This machine', reachable: true },
        { environmentId: 'env-2', label: 'MacStudio1', reachable: false },
      ],
    });
    expect(fleetThreadMachinesSchema.safeParse(listed).success).toBe(true);
    expect((mocks.sent[0] as Sent).request.kind).toBe('machines');
    expect((await machines('')).status).toBe(422);
  });
});

describe('read markers', () => {
  it('keep a count per thread, only ever grow, and hold the 300 touched last', async () => {
    const store = createMemoryMastermindStore();
    expect(await markSeen(store, OWNER, 'a', 5)).toBe(true);
    expect(await markSeen(store, OWNER, 'a', 3)).toBe(true);
    expect(await readSeen(store, OWNER)).toEqual({ a: 5 });
    expect(await readSeen(store, STRANGER)).toEqual({});
    for (let i = 0; i < 300; i++) await markSeen(store, OWNER, `t${i}`, i);
    const seen = await readSeen(store, OWNER);
    expect(Object.keys(seen)).toHaveLength(300);
    expect(seen).not.toHaveProperty('a');
    expect(seen.t299).toBe(299);
    // Anything in the store that is not a count is ignored.
    await store.set(
      `mastermind:fleet:v1:seen:${OWNER}`,
      '{"x":"y","z":-1,"k":2}',
      {
        ttlMs: 60_000,
      }
    );
    expect(await readSeen(store, OWNER)).toEqual({ k: 2 });
  });
});
