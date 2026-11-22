import {
  createDecipheriv,
  createHmac,
  createPrivateKey,
  createPublicKey,
  hkdfSync,
  randomUUID,
  sign,
} from 'node:crypto';
import { MastermindBridgeError } from '@tuturuuu/utils/mastermind-store/bridge-client';
import {
  BRIDGE_ACK_KEY_INFO,
  BRIDGE_DIGEST_KEY_INFO,
  BRIDGE_LIMITS,
  BRIDGE_SEAL_KEY_INFO,
  type BridgeReceipt,
  bridgeAckSigningString,
  bridgeReplyEnvelopeSchema,
  bridgeReplySigningString,
  bridgeSealContext,
} from '@tuturuuu/utils/mastermind-store/bridge-protocol';
import { createMemoryMastermindStore } from '@tuturuuu/utils/mastermind-store/client';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const OWNER = '11111111-1111-4111-8111-111111111111';
const STRANGER = '33333333-3333-4333-8333-333333333333';
// A stand-in fleet signing value, padded to a usable length.
const SECRET = 'fleet-test-'.padEnd(44, 'f');
const THREAD = 'thread:project:mcp%3Aabc:1234';
const DIGEST = 'a'.repeat(64);
const NOW_S = () => Math.floor(Date.now() / 1000);

type Account =
  | { status: 'allowed'; userId: string; proof: unknown }
  | { status: 'required'; userId: string }
  | { status: 'unavailable' }
  | { status: 'invalid' };

const mocks = vi.hoisted(() => ({
  user: { id: '' },
  claims: null as Record<string, unknown> | null,
  appToken: null as string | null,
  account: null as unknown,
  accountCheck: vi.fn(),
  granted: [] as string[],
  store: null as unknown,
  bridge: null as Record<string, ReturnType<typeof vi.fn>> | null,
  authOptions: [] as { allowAppSessionAuth?: unknown }[],
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: (
    handler: (r: Request, a: unknown, p: unknown) => Response,
    options?: { allowAppSessionAuth?: unknown }
  ) => (
    mocks.authOptions.push(options ?? {}),
    async (request: Request, context?: { params?: unknown }) =>
      handler(
        request,
        {
          user: mocks.user,
          appSessionToken: mocks.appToken ?? undefined,
          supabase: {
            auth: {
              getClaims: async () =>
                mocks.claims
                  ? { data: { claims: mocks.claims }, error: null }
                  : { data: null, error: new Error('no session') },
            },
          },
        },
        await context?.params
      )
  ),
}));
// The platform's own account check has its own tests; here it is the gate
// the route must consult, for the principal the route admitted.
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
    configuredMastermindBridge: () => mocks.bridge,
  })
);

/** The machine's acknowledgement key, as the daemon derives it from the fleet secret. */
const machineKey = (secret: string) =>
  createPrivateKey({
    key: Buffer.concat([
      Buffer.from('302e020100300506032b657004220420', 'hex'),
      Buffer.from(
        hkdfSync('sha256', secret, Buffer.alloc(0), BRIDGE_ACK_KEY_INFO, 32)
      ),
    ]),
    format: 'der',
    type: 'pkcs8',
  });

/** A receipt as the store returns it; settled ones carry the machine's signature. */
function receipt(
  over: Partial<BridgeReceipt> = {},
  secret: string | null = SECRET
): BridgeReceipt {
  const base: BridgeReceipt = {
    id: randomUUID(),
    machineId: 'skr-m4',
    threadId: THREAD,
    state: 'delivered',
    delivery: 'steered',
    createdAt: 1_800_000_000_000,
    settledAt: 1_800_000_000_400,
    textDigest: DIGEST,
    ...over,
  };
  if (!secret || (base.state !== 'delivered' && base.state !== 'failed'))
    return base;
  return {
    ...base,
    ackSig: sign(
      null,
      Buffer.from(
        bridgeAckSigningString({
          id: base.id,
          machineId: base.machineId,
          state: base.state,
          ...(base.delivery ? { delivery: base.delivery } : {}),
          ...(base.code ? { code: base.code } : {}),
          textDigest: base.textDigest,
        })
      ),
      machineKey(secret)
    ).toString('hex'),
  };
}

const proof = (ageSeconds: number, over: Record<string, unknown> = {}) => ({
  sessionId: 'session-1',
  verifiedAt: NOW_S() - ageSeconds,
  ...over,
});
const allowed = (value: unknown): Account => ({
  status: 'allowed',
  userId: OWNER,
  proof: value,
});

/** Verified Supabase claims of a session whose second factor ran `ageSeconds` ago. */
const mfaClaims = (ageSeconds: number, sub = OWNER) => ({
  sub,
  aal: 'aal2',
  session_id: 'session-1',
  amr: [
    { method: 'password', timestamp: NOW_S() - 9000 },
    { method: 'totp', timestamp: NOW_S() - ageSeconds },
  ],
});

function reply(
  body: Record<string, unknown> = {},
  key: string | null = randomUUID()
) {
  return new NextRequest(
    'https://tuturuuu.com/api/v1/mastermind/fleet/replies',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(key ? { 'idempotency-key': key } : {}),
      },
      body: JSON.stringify({
        machineId: 'skr-m4',
        threadId: THREAD,
        text: 'Ship it',
        ...body,
      }),
    }
  );
}

beforeEach(() => {
  vi.stubEnv('MASTERMIND_FLEET_PUBLISHER_SECRET', SECRET);
  vi.stubEnv('MASTERMIND_FLEET_OWNER_IDS', OWNER);
  vi.stubEnv('MASTERMIND_REPLY_MFA_MAX_AGE_SECONDS', '');
  mocks.user = { id: OWNER };
  mocks.granted = ['manage_mastermind', 'view_infrastructure'];
  mocks.claims = null;
  mocks.appToken = null;
  mocks.account = allowed(proof(60));
  mocks.accountCheck.mockClear();
  mocks.store = createMemoryMastermindStore();
  mocks.bridge = {
    socketUrl: 'wss://store.example/v1/bridge/connect' as never,
    ticket: vi.fn(async () => ({
      ticket: 't'.repeat(43),
      expiresAt: 1_800_000_060_000,
    })),
    send: vi.fn(async () => ({ receipt: receipt(), replayed: false })),
    receipt: vi.fn(async () => receipt()),
    live: vi.fn(async () => ({
      machines: [
        {
          machineId: 'skr-m4',
          connected: true,
          connectedAt: 1_800_000_000_000,
        },
      ],
      pokes: [
        { machineId: 'skr-m4', topic: 'usage', revision: 3, observedAt: 'x' },
      ],
    })),
  };
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const repliesRoute = () => import('./replies/route');
const noParams = { params: Promise.resolve({}) } as never;
const derive = (info: string) =>
  Buffer.from(hkdfSync('sha256', SECRET, Buffer.alloc(0), info, 32));

describe('POST /api/v1/mastermind/fleet/replies', () => {
  it('seals and signs the owner reply for the machine and returns the steered receipt', async () => {
    const key = randomUUID();
    const { POST } = await repliesRoute();
    const response = await POST(
      reply({ text: '  Ship\u200B it\u202E  ', environmentId: 'env-2' }, key),
      noParams
    );
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      state: 'delivered',
      delivery: 'steered',
      threadId: THREAD,
    });
    const sent = mocks.bridge!.send!.mock.calls[0]![0];
    expect(bridgeReplyEnvelopeSchema.safeParse(sent.envelope).success).toBe(
      true
    );
    expect(sent.envelope).toMatchObject({
      id: key,
      machineId: 'skr-m4',
      environmentId: 'env-2',
      threadId: THREAD,
      actorId: OWNER,
    });
    expect(sent.envelope.expiresAt - sent.envelope.issuedAt).toBe(
      24 * 60 * 60 * 1000
    );
    expect(sent.waitMs).toBe(BRIDGE_LIMITS.maxWaitMs);
    // Nothing the store receives is readable text.
    expect(JSON.stringify(sent)).not.toContain('Ship');
    // The machine opens it with the key derived from the fleet secret, bound
    // to this reply. Invisible and bidi-control characters never reach it.
    const data = Buffer.from(sent.envelope.box.data, 'base64url');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      derive(BRIDGE_SEAL_KEY_INFO),
      Buffer.from(sent.envelope.box.iv, 'base64url')
    );
    decipher.setAAD(Buffer.from(bridgeSealContext(key, 'skr-m4')));
    decipher.setAuthTag(data.subarray(data.length - 16));
    const text = Buffer.concat([
      decipher.update(data.subarray(0, data.length - 16)),
      decipher.final(),
    ]).toString('utf8');
    expect(text).toBe('Ship it');
    // The digest is keyed, and the signature covers every field.
    expect(sent.envelope.textDigest).toBe(
      createHmac('sha256', derive(BRIDGE_DIGEST_KEY_INFO))
        .update('Ship it')
        .digest('hex')
    );
    expect(sent.sig).toBe(
      createHmac('sha256', SECRET)
        .update(bridgeReplySigningString(sent.envelope))
        .digest('hex')
    );
    // The store gets the public half of the machine's acknowledgement key.
    expect(sent.ackKey).toBe(
      createPublicKey(machineKey(SECRET))
        .export({ format: 'der', type: 'spki' })
        .subarray(-32)
        .toString('base64url')
    );
    // ...and that signature is not a valid publisher request signature.
    expect(bridgeReplySigningString(sent.envelope)).toMatch(
      /^mastermind-fleet-reply-v1\n/
    );
  });

  it('admits only the fleet owner', async () => {
    const { POST } = await repliesRoute();
    for (const setup of [
      () => {
        mocks.user = { id: STRANGER };
      },
      () => {
        mocks.granted = [];
      },
    ]) {
      mocks.user = { id: OWNER };
      mocks.granted = ['manage_mastermind', 'view_infrastructure'];
      setup();
      expect((await POST(reply(), noParams)).status).toBe(403);
    }
    expect(mocks.bridge!.send).not.toHaveBeenCalled();
    expect(mocks.accountCheck).not.toHaveBeenCalled();
  });

  it('asks the platform account check for the principal and credential it admitted', async () => {
    const { POST } = await repliesRoute();
    await POST(reply(), noParams);
    expect(mocks.accountCheck.mock.calls[0]![2]).toEqual({ userId: OWNER });
    mocks.appToken = 'app-session-token';
    await POST(reply(), noParams);
    expect(mocks.accountCheck.mock.calls[1]![2]).toEqual({
      userId: OWNER,
      appToken: 'app-session-token',
    });
    expect(mocks.authOptions.at(-1)?.allowAppSessionAuth).toEqual({
      targetApp: 'mastermind',
      requiredScope: 'internal-app:session',
    });
  });

  it('refuses when the account check refuses: recovery, removed factor, another user', async () => {
    const { POST } = await repliesRoute();
    for (const [account, status] of [
      [{ status: 'required', userId: OWNER }, 401],
      [{ status: 'invalid' }, 401],
      [{ status: 'unavailable' }, 503],
    ] as const) {
      mocks.account = account;
      // Even with a perfectly fresh browser proof on the request.
      mocks.claims = mfaClaims(10);
      const response = await POST(reply(), noParams);
      expect(response.status).toBe(status);
      if (status === 401)
        expect(await response.json()).toEqual({
          error: 'mfa_required',
          maxAgeSeconds: 30 * 60,
        });
    }
    expect(mocks.bridge!.send).not.toHaveBeenCalled();
  });

  it('requires a second-factor proof of this session inside the window, on top of the account check', async () => {
    const { POST } = await repliesRoute();
    const status = async () => (await POST(reply(), noParams)).status;
    for (const value of [
      proof(31 * 60),
      proof(60, { expiresAt: NOW_S() - 1 }),
      proof(-120),
    ]) {
      mocks.account = allowed(value);
      expect(await status()).toBe(401);
    }
    // An account without the required-MFA policy passes the account check
    // with no proof; this route still needs one, from this user's own
    // verified claims.
    mocks.account = allowed(null);
    for (const claims of [
      null,
      { ...mfaClaims(60), aal: 'aal1' },
      mfaClaims(31 * 60),
      mfaClaims(60, STRANGER),
      { ...mfaClaims(60), amr: [{ method: 'password', timestamp: NOW_S() }] },
    ]) {
      mocks.claims = claims;
      expect(await status()).toBe(401);
    }
    mocks.claims = mfaClaims(60);
    expect(await status()).toBe(202);
    // An app session has no claims to fall back on: its token carries the
    // proof or it does not.
    mocks.appToken = 'app-session-token';
    expect(await status()).toBe(401);
    mocks.account = allowed(proof(120));
    expect(await status()).toBe(202);
    expect(mocks.bridge!.send).toHaveBeenCalledTimes(2);

    // The window is configurable within bounds; nonsense keeps the default.
    mocks.account = allowed(proof(31 * 60));
    vi.stubEnv('MASTERMIND_REPLY_MFA_MAX_AGE_SECONDS', '3600');
    expect(await status()).toBe(202);
    vi.stubEnv('MASTERMIND_REPLY_MFA_MAX_AGE_SECONDS', '999999');
    expect(await status()).toBe(401);
  });

  it('rejects malformed replies without calling the bridge', async () => {
    const { POST } = await repliesRoute();
    const cases: [NextRequest, number, string][] = [
      [reply({}, null), 400, 'idempotency_key_required'],
      [reply({}, 'not-a-uuid'), 400, 'idempotency_key_required'],
      [reply({ text: '\u200B  ' }), 422, 'invalid_reply'],
      [
        reply({ text: 'x'.repeat(BRIDGE_LIMITS.maxTextChars + 1) }),
        422,
        'invalid_reply',
      ],
      [reply({ threadId: 'has space' }), 422, 'invalid_reply'],
      [reply({ threadId: '--json' }), 422, 'invalid_reply'],
      [reply({ machineId: '../etc' }), 422, 'invalid_reply'],
      [reply({ environmentId: '-e' }), 422, 'invalid_reply'],
      [reply({ attachments: ['file'] }), 422, 'invalid_reply'],
      [reply({ command: 'rm -rf' }), 422, 'invalid_reply'],
    ];
    for (const [request, status, error] of cases) {
      const response = await POST(request, noParams);
      expect([response.status, await response.json()]).toEqual([
        status,
        { error },
      ]);
    }
    expect(mocks.bridge!.send).not.toHaveBeenCalled();
  });

  it('maps bridge refusals to closed errors and never echoes the text', async () => {
    const { POST } = await repliesRoute();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (const [code, status, error] of [
      ['rate_limited', 429, 'rate_limited'],
      ['conflict', 409, 'idempotency_conflict'],
      ['full', 507, 'outbox_full'],
      ['budget', 429, 'budget_exhausted'],
      ['stopped', 503, 'stopped'],
      ['timeout', 503, 'unavailable'],
    ] as const) {
      mocks.bridge!.send!.mockRejectedValueOnce(
        new MastermindBridgeError(code)
      );
      const response = await POST(reply({ text: 'private words' }), noParams);
      const text = await response.text();
      expect([response.status, JSON.parse(text)]).toEqual([status, { error }]);
      expect(text).not.toContain('private words');
    }
  });

  it('reports delivered or failed only with the machine signature over that outcome', async () => {
    const { POST } = await repliesRoute();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const post = async (stored: BridgeReceipt) => {
      mocks.bridge!.send!.mockResolvedValueOnce({
        receipt: stored,
        replayed: false,
      });
      return (await POST(reply(), noParams)).json();
    };
    // What a store (or anyone holding its token) could make up on its own.
    for (const forged of [
      receipt({}, null),
      { ...receipt({}, null), ackSig: '0'.repeat(128) },
      receipt({}, 'another-secret-another-secret-123456'),
      { ...receipt({ delivery: 'queued' }), delivery: 'steered' as const },
      { ...receipt(), state: 'failed' as const, code: 'expired' as const },
      { ...receipt(), textDigest: 'b'.repeat(64) },
      { ...receipt(), machineId: 'other' },
    ]) {
      const view = await post(forged);
      expect(view.state).toBe('sent');
      expect(view).not.toHaveProperty('delivery');
      expect(view).not.toHaveProperty('code');
      expect(view).not.toHaveProperty('settledAt');
    }
    expect(warn).toHaveBeenCalledTimes(7);
    // The machine's own word, either way.
    expect(await post(receipt({ delivery: 'started' }))).toMatchObject({
      state: 'delivered',
      delivery: 'started',
    });
    expect(
      await post(
        receipt({
          state: 'failed',
          delivery: undefined,
          code: 'unknown_thread',
        })
      )
    ).toMatchObject({ state: 'failed', code: 'unknown_thread' });
    // States the store may report by itself are passed through.
    for (const state of ['sent', 'expired'] as const)
      expect(
        (
          await post(
            receipt({ state, delivery: undefined, settledAt: undefined })
          )
        ).state
      ).toBe(state);
  });

  it('fails closed without the signing secret or the bridge', async () => {
    const { POST } = await repliesRoute();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubEnv('MASTERMIND_FLEET_PUBLISHER_SECRET', 'short');
    expect((await POST(reply(), noParams)).status).toBe(503);
    expect(mocks.bridge!.send).not.toHaveBeenCalled();
    vi.stubEnv('MASTERMIND_FLEET_PUBLISHER_SECRET', SECRET);
    mocks.bridge = null;
    expect((await POST(reply(), noParams)).status).toBe(503);
  });

  it('logs who, where and the digest of each new reply, never the text', async () => {
    const { POST } = await repliesRoute();
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    await POST(reply({ text: 'private words' }), noParams);
    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0]![1]).toMatchObject({
      actorId: OWNER,
      sessionId: 'session-1',
      machineId: 'skr-m4',
      threadId: THREAD,
      textDigest: createHmac('sha256', derive(BRIDGE_DIGEST_KEY_INFO))
        .update('private words')
        .digest('hex'),
      state: 'delivered',
    });
    expect(JSON.stringify(info.mock.calls)).not.toContain('private words');
    // A replayed receipt is not a new post.
    mocks.bridge!.send!.mockResolvedValueOnce({
      receipt: receipt(),
      replayed: true,
    });
    await POST(reply(), noParams);
    expect(info).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/v1/mastermind/fleet/replies/[replyId]', () => {
  it('returns the owner the verified delivery state and nothing to anyone else', async () => {
    const { GET } = await import('./replies/[replyId]/route');
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const id = randomUUID();
    const get = (replyId: string) =>
      GET(
        new NextRequest(
          `https://tuturuuu.com/api/v1/mastermind/fleet/replies/${replyId}`
        ),
        { params: Promise.resolve({ replyId }) } as never
      );
    mocks.bridge!.receipt!.mockResolvedValueOnce(
      receipt({
        id,
        state: 'sent',
        delivery: undefined,
        settledAt: undefined,
      })
    );
    // The digest and the signature stay on the server.
    expect(await (await get(id)).json()).toEqual({
      id,
      machineId: 'skr-m4',
      threadId: THREAD,
      state: 'sent',
      createdAt: new Date(1_800_000_000_000).toISOString(),
    });
    mocks.bridge!.receipt!.mockResolvedValueOnce(receipt({ id }));
    expect(await (await get(id)).json()).toMatchObject({
      state: 'delivered',
      delivery: 'steered',
    });
    mocks.bridge!.receipt!.mockResolvedValueOnce(receipt({ id }, null));
    expect((await (await get(id)).json()).state).toBe('sent');
    mocks.bridge!.receipt!.mockResolvedValueOnce(null);
    expect((await get(id)).status).toBe(404);
    expect((await get('nope')).status).toBe(404);
    mocks.user = { id: STRANGER };
    expect((await get(id)).status).toBe(403);
  });
});
