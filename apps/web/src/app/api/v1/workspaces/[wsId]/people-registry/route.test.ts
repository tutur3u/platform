import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  lookupHash,
  newWorkspaceKeys,
  PEOPLE_KEY_PURPOSES,
  suppressionToken,
  unwrapWorkspaceKey,
  wrapWorkspaceKey,
} from '@/lib/people-registry/keys';
import { PUT as putBinding } from './bindings/route';
import { GET as getPerson } from './persons/[personId]/route';
import { POST as addIdentity } from './persons/[personId]/identities/route';
import { PUT as putFact } from './persons/[personId]/facts/route';
import { GET as listPersons } from './persons/route';
import { GET as getControl, POST as enable } from './route';

const { rpc, actor, authOptions, claims } = vi.hoisted(() => ({
  rpc: vi.fn(),
  actor: vi.fn<() => string | null>(),
  authOptions: [] as unknown[],
  claims: vi.fn(),
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
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
  withSessionAuth: (
    handler: (
      request: NextRequest,
      context: { user: { id: string }; supabase: unknown },
      params: unknown
    ) => Promise<NextResponse>,
    options: unknown
  ) => {
    authOptions.push(options);
    return async (
      request: NextRequest,
      routeContext?: { params?: Promise<unknown> }
    ) => {
      const id = actor();
      return id
        ? handler(
            request,
            { user: { id }, supabase: { auth: { getClaims: claims } } },
            await routeContext?.params
          )
        : NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    };
  },
}));

// Matches the app-coordination token prefix in @tuturuuu/utils.
const APP_TOKEN_PREFIX = 'ttr_app_coordination_';

const actorId = '21dfc803-cfa0-4345-80f9-d32248704e6d';
const wsId = '4f1f8c6e-4a39-4a8e-9a3f-0f4e0a1d2c3b';
const personId = '7a6b5c4d-3e2f-4a1b-8c9d-0e1f2a3b4c5d';

function call(method: string, path: string, body?: unknown) {
  return new NextRequest(
    `https://tuturuuu.com/api/v1/workspaces/${wsId}/people-registry${path}`,
    {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }
  );
}

function params(): { params: Promise<{ wsId: string }> };
function params<T extends Record<string, string>>(
  extra: T
): { params: Promise<{ wsId: string } & T> };
function params(extra: Record<string, string> = {}) {
  return { params: Promise.resolve({ wsId, ...extra }) };
}

// Re-wraps a fresh version-1 key as version 2 to simulate a rotation.
function rewrap(
  wrapped: string,
  purpose: (typeof PEOPLE_KEY_PURPOSES)[number]
) {
  const key = unwrapWorkspaceKey(wsId, {
    purpose,
    version: 1,
    wrappedKey: wrapped,
    current: true,
  });
  return wrapWorkspaceKey(wsId, purpose, 2, key.key);
}

function control() {
  const wrapped = newWorkspaceKeys(wsId);
  return {
    isOwner: true,
    captureEnabled: false,
    personalSessionsEnabled: false,
    stopped: false,
    generation: 3,
    keys: PEOPLE_KEY_PURPOSES.map((purpose) => ({
      purpose,
      version: 1,
      wrappedKey: wrapped[purpose],
      current: true,
    })),
  };
}

describe('people registry manager routes', () => {
  beforeEach(() => {
    process.env.PEOPLE_REGISTRY_WRAP_KID = '1a2b3c4d';
    process.env.PEOPLE_REGISTRY_WRAP_KEY_1a2b3c4d =
      randomBytes(32).toString('hex');
    actor.mockReturnValue(actorId);
    rpc.mockReset();
    claims.mockResolvedValue({
      data: {
        claims: {
          sub: actorId,
          amr: [
            {
              method: 'password',
              timestamp: Math.floor(Date.now() / 1000) - 30,
            },
          ],
        },
      },
      error: null,
    });
  });
  afterEach(() => {
    delete process.env.PEOPLE_REGISTRY_WRAP_KID;
    delete process.env.PEOPLE_REGISTRY_WRAP_KEY_1a2b3c4d;
    delete process.env.FLEET_DESKS;
  });

  it('refuses anonymous callers without touching the registry', async () => {
    actor.mockReturnValue(null);
    const response = await listPersons(call('GET', '/persons'), params());
    expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('accepts web, CLI and Mastermind sessions', () => {
    expect(authOptions).toContainEqual({
      allowAppSessionAuth: { targetApp: ['platform', 'mastermind'] },
      preferSupabaseSessionAuth: true,
    });
  });

  it('rejects a malformed workspace before any database call', async () => {
    const response = await listPersons(call('GET', '/persons'), {
      params: Promise.resolve({ wsId: 'not-a-uuid' }),
    });
    expect(response.status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('passes the session actor and path workspace, never body values', async () => {
    rpc.mockResolvedValue({
      data: { reason: 'updated', revision: 1 },
      error: null,
    });
    const response = await putFact(
      call('PUT', `/persons/${personId}/facts`, {
        key: 'language',
        value: 'vi',
        baseRevision: null,
      }),
      params({ personId })
    );
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      'people_set_fact',
      expect.objectContaining({
        p_ws: wsId,
        p_actor: actorId,
        p_person: personId,
      })
    );
    const smuggled = await putFact(
      call('PUT', `/persons/${personId}/facts`, {
        key: 'language',
        value: 'vi',
        baseRevision: null,
        p_actor: 'x',
      }),
      params({ personId })
    );
    expect(smuggled.status).toBe(400);
  });

  it('maps refusals without leaking database detail', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '42501', message: 'secret detail' },
    });
    const forbidden = await listPersons(call('GET', '/persons'), params());
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toEqual({ error: 'forbidden' });
    expect(forbidden.headers.get('cache-control')).toBe('private, no-store');

    vi.spyOn(console, 'error').mockImplementation(() => {});
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: 'XX000', message: 'boom' },
    });
    const unavailable = await listPersons(call('GET', '/persons'), params());
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toEqual({ error: 'registry_unavailable' });
  });

  it('returns control flags without wrapped keys', async () => {
    rpc.mockResolvedValue({ data: control(), error: null });
    const response = await getControl(call('GET', ''), params());
    const body = await response.json();
    expect(body).toEqual({
      isOwner: true,
      captureEnabled: false,
      personalSessionsEnabled: false,
      stopped: false,
      generation: 3,
    });
  });

  it('enables the registry with one wrapped key per purpose', async () => {
    rpc.mockResolvedValue({ data: { reason: 'enabled' }, error: null });
    const response = await enable(call('POST', ''), params());
    expect(response.status).toBe(201);
    const args = rpc.mock.calls[0]?.[1] as {
      p_wrapped_keys: Record<string, string>;
    };
    expect(Object.keys(args.p_wrapped_keys).sort()).toEqual(
      [...PEOPLE_KEY_PURPOSES].sort()
    );
  });

  it('never binds an internal Fleet desk account', async () => {
    process.env.FLEET_DESKS = JSON.stringify({
      desk: { channel: 'zalo', account: 'oa-internal' },
    });
    const response = await putBinding(
      call('PUT', '/bindings', { channel: 'zalo', account: 'oa-internal' }),
      params()
    );
    expect(response.status).toBe(409);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('stores identities as hashes, tokens and bound ciphertext only', async () => {
    const stored = control();
    rpc.mockImplementation(
      async (fn: string, args: Record<string, unknown>) => {
        if (fn === 'people_registry_get_control')
          return { data: stored, error: null };
        if (fn === 'people_add_identity')
          return {
            data: { reason: 'proposed', identityId: 'id-1', args },
            error: null,
          };
        return {
          data: {
            id: personId,
            identities: [
              {
                id: 'id-1',
                channel: 'whatsapp',
                providerAccountId: 'acct',
                displayCiphertext: Buffer.from(
                  String(
                    rpc.mock.calls.find(
                      ([name]) => name === 'people_add_identity'
                    )?.[1]?.p_display_ciphertext
                  ).slice(2),
                  'hex'
                ).toString('base64'),
              },
            ],
          },
          error: null,
        };
      }
    );
    const added = await addIdentity(
      call('POST', `/persons/${personId}/identities`, {
        channel: 'whatsapp',
        account: 'acct',
        externalId: '+84 90 000 0000',
        displayValue: '+84 90 000 0000',
        basis: 'owner_statement',
      }),
      params({ personId })
    );
    expect(added.status).toBe(201);
    const args = rpc.mock.calls.find(
      ([name]) => name === 'people_add_identity'
    )?.[1] as Record<string, unknown>;
    expect(JSON.stringify(args)).not.toContain('84 90');
    expect(JSON.stringify(args)).not.toContain('84900000000');
    expect(args.p_suppression_checks).toContain(args.p_suppression_token);

    const detail = await getPerson(
      call('GET', `/persons/${personId}`),
      params({ personId })
    );
    const body = await detail.json();
    expect(body.identities[0]).toMatchObject({
      displayValue: '+84 90 000 0000',
    });
    expect(body.identities[0]).not.toHaveProperty('displayCiphertext');
  });
  it('requires a fresh sign-in before enabling', async () => {
    claims.mockResolvedValue({
      data: {
        claims: {
          sub: actorId,
          amr: [
            {
              method: 'password',
              timestamp: Math.floor(Date.now() / 1000) - 900,
            },
          ],
        },
      },
      error: null,
    });
    const stale = await enable(call('POST', ''), params());
    expect(stale.status).toBe(401);
    claims.mockResolvedValue({ data: null, error: new Error('app session') });
    const appSession = await enable(call('POST', ''), params());
    expect(appSession.status).toBe(401);
    claims.mockResolvedValue({
      data: {
        claims: {
          sub: 'someone-else',
          amr: [
            { method: 'password', timestamp: Math.floor(Date.now() / 1000) },
          ],
        },
      },
      error: null,
    });
    const otherUser = await enable(call('POST', ''), params());
    expect(otherUser.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(['[]', '"desk"', 'not json', '{"desk":"zalo"}'])(
    'refuses every bind when FLEET_DESKS is malformed (%s)',
    async (value) => {
      process.env.FLEET_DESKS = value;
      const response = await putBinding(
        call('PUT', '/bindings', { channel: 'zalo', account: 'oa-tenant' }),
        params()
      );
      expect(response.status).toBe(409);
      expect(rpc).not.toHaveBeenCalled();
    }
  );

  it('rejects an identifier that has no canonical form', async () => {
    rpc.mockResolvedValue({ data: control(), error: null });
    const response = await addIdentity(
      call('POST', `/persons/${personId}/identities`, {
        channel: 'phone',
        account: 'acct',
        externalId: 'call me',
        basis: 'owner_statement',
      }),
      params({ personId })
    );
    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalledWith(
      'people_add_identity',
      expect.anything()
    );
  });

  it('checks suppression across every retained lookup and suppression version', async () => {
    const wrapped = control();
    const extra = newWorkspaceKeys(wsId);
    const rotated = {
      ...wrapped,
      keys: [
        ...wrapped.keys.map((key) =>
          key.purpose === 'sender_lookup' || key.purpose === 'suppression'
            ? { ...key, current: false }
            : key
        ),
        {
          purpose: 'sender_lookup',
          version: 2,
          wrappedKey: rewrap(extra.sender_lookup, 'sender_lookup'),
          current: true,
        },
        {
          purpose: 'suppression',
          version: 2,
          wrappedKey: rewrap(extra.suppression, 'suppression'),
          current: true,
        },
      ],
    };
    rpc.mockImplementation(async (fn: string) =>
      fn === 'people_registry_get_control'
        ? { data: rotated, error: null }
        : { data: { reason: 'proposed' }, error: null }
    );
    const response = await addIdentity(
      call('POST', `/persons/${personId}/identities`, {
        channel: 'zalo',
        account: 'acct',
        externalId: 'user-1',
        basis: 'owner_statement',
      }),
      params({ personId })
    );
    expect(response.status).toBe(201);
    const args = rpc.mock.calls.find(
      ([name]) => name === 'people_add_identity'
    )?.[1] as Record<string, unknown>;
    expect(args.p_key_version).toBe(2);
    expect(args.p_suppression_key_version).toBe(2);
    expect(args.p_suppression_checks).toHaveLength(4);
    expect(new Set(args.p_suppression_checks as string[]).size).toBe(4);
    expect(args.p_suppression_checks).toContain(args.p_suppression_token);
    const v1 = (purpose: (typeof PEOPLE_KEY_PURPOSES)[number]) => {
      const record = wrapped.keys.find((key) => key.purpose === purpose);
      if (!record) throw new Error(`missing ${purpose}`);
      return unwrapWorkspaceKey(wsId, record);
    };
    const storedBeforeRotation = suppressionToken(
      v1('suppression'),
      wsId,
      lookupHash(v1('sender_lookup'), {
        wsId,
        channel: 'zalo',
        account: 'acct',
        externalId: 'user-1',
      })
    );
    expect(args.p_suppression_checks).toContain(
      `\\x${storedBeforeRotation.toString('hex')}`
    );
  });

  it('never treats an app session as a fresh sign-in', async () => {
    const response = await enable(
      new NextRequest(
        `https://tuturuuu.com/api/v1/workspaces/${wsId}/people-registry`,
        {
          method: 'POST',
          headers: { authorization: `Bearer ${APP_TOKEN_PREFIX}test` },
        }
      ),
      params()
    );
    expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses future sign-in times and claim errors', async () => {
    claims.mockResolvedValue({
      data: {
        claims: {
          sub: actorId,
          amr: [
            {
              method: 'password',
              timestamp: Math.floor(Date.now() / 1000) + 120,
            },
          ],
        },
      },
      error: null,
    });
    expect((await enable(call('POST', ''), params())).status).toBe(401);
    claims.mockResolvedValue({
      data: {
        claims: {
          sub: actorId,
          amr: [
            { method: 'password', timestamp: Math.floor(Date.now() / 1000) },
          ],
        },
      },
      error: new Error('invalid'),
    });
    expect((await enable(call('POST', ''), params())).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('normalises person IDs and rejects malformed ones', async () => {
    rpc.mockResolvedValue({
      data: { reason: 'updated', revision: 1 },
      error: null,
    });
    await putFact(
      call('PUT', `/persons/${personId.toUpperCase()}/facts`, {
        key: 'language',
        value: 'vi',
        baseRevision: null,
      }),
      params({ personId: personId.toUpperCase() })
    );
    expect(rpc).toHaveBeenCalledWith(
      'people_set_fact',
      expect.objectContaining({ p_person: personId })
    );
    rpc.mockClear();
    const bad = await putFact(
      call('PUT', '/persons/x/facts', {
        key: 'language',
        value: 'vi',
        baseRevision: null,
      }),
      params({ personId: 'x' })
    );
    expect(bad.status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('maps invalid text representations to a bad request', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '22P02' } });
    const response = await listPersons(call('GET', '/persons'), params());
    expect(response.status).toBe(400);
  });

  it('refuses binds when the desk list is missing in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    delete process.env.FLEET_DESKS;
    const response = await putBinding(
      call('PUT', '/bindings', { channel: 'zalo', account: 'oa-tenant' }),
      params()
    );
    vi.unstubAllEnvs();
    expect(response.status).toBe(409);
    expect(rpc).not.toHaveBeenCalled();
  });
});
