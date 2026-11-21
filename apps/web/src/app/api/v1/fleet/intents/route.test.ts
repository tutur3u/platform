import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  sign,
} from 'node:crypto';
import {
  createAppSessionToken,
  verifyAppSessionRequest,
} from '@tuturuuu/auth/app-session';
import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as readDeskDigest } from '../desk/digest/route';
import { POST as confirm } from '../identity/confirm/route';
import { POST as createCode } from '../identity/link-codes/route';
import { POST as verifyCode } from '../identity/verify/route';
import { GET, POST } from './route';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => ({
    schema: (name: string) => {
      expect(name).toBe('private');
      return { rpc };
    },
  }),
}));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (
      handler: (
        req: NextRequest,
        context: { user: { id: string } }
      ) => Promise<NextResponse>,
      options: { allowAppSessionAuth: { targetApp: string | string[] } }
    ) =>
    (request: NextRequest) => {
      if (request.headers.get('cookie')) {
        return handler(request, { user: { id: actorId } });
      }
      const session = verifyAppSessionRequest(
        request,
        options.allowAppSessionAuth
      );
      if (!session.ok)
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      return handler(request, { user: { id: session.claims.sub } });
    },
}));

const actorId = 'fc000000-0000-4000-8000-000000000001';
const intentId = 'fc000000-0000-4000-8000-000000000002';
const code = 'a'.repeat(43);
const intent = {
  kind: 'priority.set',
  payload: {
    projectKey: 'platform',
    targetKey: 'lane-alpha',
    priority: 'high',
  },
};

const ingress = generateKeyPairSync('ed25519');
const deskToken = `ttr_fleet_desk_zalo.${randomBytes(32).toString('base64url')}`;
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');

function appAuthorization(targetApp: 'platform' | 'mastermind') {
  const { token } = createAppSessionToken({
    userId: actorId,
    targetApp,
    scopes: ['internal-app:session'],
  });
  return `Bearer ${token}`;
}

function request(path: string, body?: unknown, authorization?: string) {
  return new NextRequest(`https://tuturuuu.com/api/v1/fleet/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      ...(authorization
        ? { authorization }
        : { cookie: 'sb-fleet-auth-token=fixture-web' }),
      'x-user-id': intentId,
    },
  });
}

function deskRequest(
  path: string,
  body: unknown,
  overrides: Record<string, unknown> = {},
  version = 2
) {
  const signedBody = JSON.stringify(body);
  const event = {
    version: 2,
    deskId: 'zalo',
    credentialVersion: 3,
    ownerGeneration: '4',
    channel: 'zalo',
    account: 'account-a',
    sender: 'sender-a',
    conversation: 'conversation-a',
    conversationType: 'private_1_to_1',
    eventId: 'event-a',
    operation:
      path === 'intents'
        ? 'intent.submit'
        : path === 'desk/digest'
          ? 'digest.read'
          : 'identity.verify',
    inputSha256: hash(signedBody),
    issuedAt: Date.now(),
    ...overrides,
  };
  const proof = Buffer.from(JSON.stringify(event)).toString('base64url');
  const signature = sign(
    null,
    Buffer.from(`fleet-event-v${version}.${proof}`),
    ingress.privateKey
  );
  const result = request(path, body, `Bearer ${deskToken}`);
  result.headers.set('x-fleet-event', proof);
  result.headers.set(
    'x-fleet-event-signature',
    signature.toString('base64url')
  );
  return result;
}

function submission(reason: string, id: string | null = null) {
  rpc.mockReturnValueOnce({
    single: async () => ({
      data: { reason_code: reason, intent_id: id },
      error: null,
    }),
  });
}

beforeEach(() => {
  rpc.mockReset();
  vi.stubEnv(
    'TUTURUUU_APP_COORDINATION_SECRET',
    randomBytes(32).toString('hex')
  );
  vi.stubEnv(
    'FLEET_DESKS',
    JSON.stringify({
      zalo: {
        tokenSha256: hash(deskToken),
        ingressPublicKey: ingress.publicKey.export({
          type: 'spki',
          format: 'pem',
        }),
        credentialVersion: 3,
      },
    })
  );
  vi.stubEnv('FLEET_IDENTITY_HMAC_KEY', randomBytes(32).toString('hex'));
});
afterEach(() => vi.unstubAllEnvs());

describe('Fleet intent routes', () => {
  it('refuses a real platform app-session token on every human write', async () => {
    expect(
      (await POST(request('intents', intent, appAuthorization('platform'))))
        .status
    ).toBe(401);
    expect(
      (
        await createCode(
          request('identity/link-codes', {}, appAuthorization('platform'))
        )
      ).status
    ).toBe(401);
    expect(
      (
        await confirm(
          request('identity/confirm', {}, appAuthorization('platform'))
        )
      ).status
    ).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('sends a status question without a target key', async () => {
    submission('accepted', intentId);
    const response = await POST(
      request(
        'intents',
        {
          kind: 'status_question',
          payload: { projectKey: 'platform', topic: 'readiness' },
        },
        appAuthorization('mastermind')
      )
    );
    expect(response.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith('fleet_submit_resolved_intent', {
      p_actor_id: actorId,
      p_kind: 'status_question',
      p_project_key: 'platform',
      p_target_key: null,
      p_parameters: { topic: 'readiness' },
      p_redacted_quote: undefined,
    });
  });

  it('uses the Mastermind session actor and keeps scrubbed quotes out of the payload', async () => {
    submission('accepted', intentId);
    const response = await POST(
      request(
        'intents',
        {
          ...intent,
          quote:
            'Check http://example.com/private or +１ (２３４) ５６７-８９００ please',
        },
        appAuthorization('mastermind')
      )
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: intentId });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(rpc).toHaveBeenCalledWith('fleet_submit_resolved_intent', {
      p_actor_id: actorId,
      p_kind: 'priority.set',
      p_project_key: 'platform',
      p_target_key: 'lane-alpha',
      p_parameters: { priority: 'high' },
      p_redacted_quote: 'Check or please',
    });
  });

  it.each([
    { ...intent, actorId: intentId },
    { ...intent, payload: { ...intent.payload, targetId: intentId } },
    { ...intent, payload: { ...intent.payload, priority: 'critical' } },
    { ...intent, payload: { ...intent.payload, quote: 'free text' } },
    { ...intent, kind: 'approve.billing' },
    {
      ...intent,
      kind: 'approve.production_change',
      payload: {
        projectKey: 'platform',
        targetKey: 'release',
        environment: 'staging',
        commitSha: 'a'.repeat(40),
      },
    },
  ])(
    'rejects invalid intent input %# before accessing the database',
    async (body) => {
      expect((await POST(request('intents', body))).status).toBe(400);
      expect(rpc).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['project_outside_grant', 403],
    ['inactive_grant', 403],
    ['intents_per_day', 429],
    ['event_replayed', 409],
  ])('maps a %s refusal with a null intent ID', async (reason, status) => {
    submission(reason);
    const response = await POST(request('intents', intent));
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: reason });
  });

  it('uses the verified actor and cursor for receipt reads', async () => {
    const intents = [
      {
        id: intentId,
        kind: 'priority.set',
        state: 'pending_approval',
        createdAt: '2026-11-21T04:00:00.000Z',
      },
    ];
    rpc.mockResolvedValueOnce({ data: intents, error: null });
    const response = await GET(
      request(
        `intents?before=${intentId}`,
        undefined,
        appAuthorization('platform')
      )
    );
    expect(await response.json()).toEqual({ intents, nextBefore: null });
    expect(rpc).toHaveBeenCalledWith('fleet_list_intents', {
      p_actor_id: actorId,
      p_before: intentId,
    });
  });

  it('fails closed when receipt access is revoked', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    expect((await GET(request('intents'))).status).toBe(403);
  });
});

describe('Fleet desk and identity routes', () => {
  it('rejects desk credentials without separate event evidence', async () => {
    expect(
      (await POST(request('intents', intent, `Bearer ${deskToken}`))).status
    ).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects a retired desk entry that carries account routing instead of a credential version', async () => {
    vi.stubEnv(
      'FLEET_DESKS',
      JSON.stringify({
        zalo: {
          tokenSha256: hash(deskToken),
          ingressPublicKey: ingress.publicKey.export({
            type: 'spki',
            format: 'pem',
          }),
          channel: 'zalo',
          account: 'account-a',
          accountLabel: 'Operations Zalo',
        },
      })
    );
    expect((await POST(deskRequest('intents', intent))).status).toBe(401);
    expect(
      (await verifyCode(deskRequest('identity/verify', { code }))).status
    ).toBe(401);
    expect((await readDeskDigest(deskRequest('desk/digest', {}))).status).toBe(
      401
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(['intents', 'identity/verify'] as const)(
    'rejects the v1 signature domain on %s',
    async (path) => {
      const body = path === 'intents' ? intent : { code };
      const response =
        path === 'intents'
          ? await POST(deskRequest(path, body, {}, 1))
          : await verifyCode(deskRequest(path, body, {}, 1));
      expect(response.status).toBe(401);
      expect(rpc).not.toHaveBeenCalled();
    }
  );

  it.each([
    { deskId: 'Zalo' },
    { credentialVersion: 0 },
    { credentialVersion: '3' },
    { ownerGeneration: '0' },
    { deskId: undefined },
  ])('rejects malformed v2 desk claims %#', async (overrides) => {
    expect((await POST(deskRequest('intents', intent, overrides))).status).toBe(
      401
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    { version: 1 },
    { ownerGeneration: 4 },
    { conversationType: 'group' },
    { operation: 'identity.verify' },
    { inputSha256: hash('different body') },
    { issuedAt: 0 },
  ])('rejects mismatched signed event evidence %#', async (overrides) => {
    expect((await POST(deskRequest('intents', intent, overrides))).status).toBe(
      401
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects evidence issued 31 seconds into the future', async () => {
    expect(
      (
        await POST(
          deskRequest('intents', intent, {
            issuedAt: Date.now() + 31_000,
          })
        )
      ).status
    ).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('verifies the signature independently of the desk bearer credential', async () => {
    const submitted = deskRequest('intents', intent);
    submitted.headers.set(
      'x-fleet-event-signature',
      randomBytes(64).toString('base64url')
    );
    expect((await POST(submitted)).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects a desk-supplied actor even when event evidence signs the forged body', async () => {
    expect(
      (await POST(deskRequest('intents', { ...intent, actorId }))).status
    ).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('passes event fingerprints to the database without a desk-supplied actor', async () => {
    submission('accepted', intentId);
    const response = await POST(deskRequest('intents', intent));
    expect(response.status).toBe(201);
    const args = rpc.mock.calls[0]?.[1];
    expect(args).not.toHaveProperty('p_actor_id');
    expect(args.p_event).toEqual({
      channel: 'zalo',
      account: 'account-a',
      version: 2,
      operation: 'intent.submit',
      conversationType: 'private_1_to_1',
      bearerDeskId: 'zalo',
      signingDeskId: 'zalo',
      signingCredentialVersion: 3,
      deskId: 'zalo',
      credentialVersion: 3,
      ownerGeneration: '4',
      eventHash: hash('event-a'),
      senderHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      conversationHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(args.p_event.senderHash).not.toBe(hash('sender-a'));
  });

  it('issues a ten-minute link code and sends only its digest to storage', async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null });
    const response = await createCode(request('identity/link-codes', {}));
    const issued = await response.json();
    expect(response.status).toBe(201);
    expect(issued).toEqual({
      code: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      expiresIn: 600,
    });
    expect(rpc).toHaveBeenCalledWith('fleet_create_link_code', {
      p_actor_id: actorId,
      p_code_hash: `\\x${hash(issued.code)}`,
    });
  });

  it('binds link verification to event evidence and confirmation to the signed-in actor', async () => {
    rpc.mockResolvedValueOnce({
      data: { reason: 'pending', linkId: intentId },
      error: null,
    });
    const verified = await verifyCode(deskRequest('identity/verify', { code }));
    const pending = await verified.json();
    expect(verified.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith(
      'fleet_verify_link_code',
      expect.objectContaining({
        p_code_hash: `\\x${hash(code)}`,
        p_confirmation_hash: `\\x${hash(pending.confirmationCode)}`,
      })
    );

    const link = { channel: 'zalo', accountLabel: 'Operations Zalo' };
    rpc.mockResolvedValueOnce({
      data: { reason: 'pending', ...link },
      error: null,
    });
    const preview = await confirm(
      request('identity/confirm', { ...pending, preview: true })
    );
    expect(preview.status).toBe(200);
    expect(await preview.json()).toEqual({ linked: false, ...link });
    expect(rpc).toHaveBeenLastCalledWith(
      'fleet_confirm_link_code',
      expect.objectContaining({
        p_actor_id: actorId,
        p_preview: true,
      })
    );

    rpc.mockResolvedValueOnce({
      data: { reason: 'confirmed', ...link },
      error: null,
    });
    const confirmation = await confirm(request('identity/confirm', pending));
    expect(confirmation.status).toBe(200);
    expect(await confirmation.json()).toEqual({ linked: true, ...link });
    expect(rpc).toHaveBeenLastCalledWith('fleet_confirm_link_code', {
      p_actor_id: actorId,
      p_pending_id: intentId,
      p_confirmation_hash: `\\x${hash(pending.confirmationCode)}`,
      p_preview: undefined,
    });
  });
});

describe('Fleet desk digest route', () => {
  it('returns the scoped digest with Slice 2 totals and no-store headers', async () => {
    const section = {
      projectKey: 'fleet-one',
      generatedAt: '2026-11-21T01:00:00.000Z',
      receivedAt: '2026-11-21T01:00:00.000Z',
      stale: false,
      lanes: [{ lane: 'Alpha', state: 'running', blockerCodes: [] }],
    };
    rpc.mockResolvedValueOnce({
      data: { reason: 'accepted', sections: [section] },
      error: null,
    });
    const response = await readDeskDigest(deskRequest('desk/digest', {}));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toMatchObject({
      sections: [section],
      totals: { projects: 1, lanes: 1 },
    });
    expect(rpc).toHaveBeenCalledExactlyOnceWith('fleet_read_desk_digest', {
      p_event: expect.objectContaining({
        operation: 'digest.read',
        bearerDeskId: 'zalo',
        signingDeskId: 'zalo',
        signingCredentialVersion: 3,
        ownerGeneration: '4',
      }),
    });
  });

  it('drops a stored section that fails the digest schema', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    rpc.mockResolvedValueOnce({
      data: { reason: 'accepted', sections: [{ projectKey: 'fleet-one' }] },
      error: null,
    });
    const response = await readDeskDigest(deskRequest('desk/digest', {}));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      sections: [],
      totals: { projects: 0, lanes: 0 },
    });
    expect(logged).toHaveBeenCalledExactlyOnceWith(
      'Invalid stored Fleet digest section'
    );
    logged.mockRestore();
  });

  it.each([
    ['unauthorized_desk_event', 401],
    ['event_replayed', 409],
    ['unlinked_identity', 403],
    ['fleet_stopped', 403],
    ['inactive_grant', 403],
    ['missing_capability', 403],
    ['questions_per_hour', 429],
  ])('maps the database refusal %s to %s', async (reason, status) => {
    rpc.mockResolvedValueOnce({ data: { reason }, error: null });
    const response = await readDeskDigest(deskRequest('desk/digest', {}));
    expect(response.status).toBe(status);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ error: reason });
  });

  it('rejects the v1 signature domain', async () => {
    const response = await readDeskDigest(
      deskRequest('desk/digest', {}, {}, 1)
    );
    expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    { version: 1 },
    { conversationType: 'group' },
    { operation: 'intent.submit' },
    { inputSha256: hash('different body') },
  ])('rejects proof outside the digest operation %#', async (overrides) => {
    const response = await readDeskDigest(
      deskRequest('desk/digest', {}, overrides)
    );
    expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects web sessions and caller-supplied project or actor inputs', async () => {
    expect((await readDeskDigest(request('desk/digest', {}))).status).toBe(401);
    expect(
      (
        await readDeskDigest(
          deskRequest('desk/digest', { actorId, projectKey: 'other' })
        )
      ).status
    ).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
