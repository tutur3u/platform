// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AbuseGuardUnavailableError,
  createAbuseGuardClient,
  createBindingGuardTransport,
  createGuardOperationId,
  createHttpGuardTransport,
} from '../client';
import { verifyGuardRequest } from '../crypto';
import type { GuardRpc } from '../protocol';
import { configureAbuseGuardRuntime, selectAbuseGuard } from '../select';

const SECRET = 's'.repeat(40);
const PEPPER = 'p'.repeat(40);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function hitReply(
  rpc: GuardRpc,
  decide: (index: number) => boolean,
  resetAt = 120_000
) {
  let denied = false;
  return {
    v: 1,
    steps: rpc.steps.map((_, index) => {
      if (denied) return { skipped: true };
      const ok = decide(index);
      denied = !ok;
      return {
        results: [
          {
            op: 'win.hit',
            ok,
            resetAt,
            windows: [{ remaining: ok ? 5 - index : 0, resetAt }],
          },
        ],
      };
    }),
  };
}

afterEach(() => {
  configureAbuseGuardRuntime(null);
  vi.useRealTimers();
});

describe('createHttpGuardTransport', () => {
  it('signs the exact body and sends only digests', async () => {
    const fetchMock = vi.fn(async (_url: URL, init?: RequestInit) => {
      const body = String(init?.body);
      const headers = new Headers(init?.headers);
      const valid = await verifyGuardRequest({
        secrets: [SECRET],
        method: 'POST',
        path: '/v1/rpc',
        body,
        timestamp: headers.get('x-guard-ts'),
        signature: headers.get('x-guard-sig'),
        now: Date.now(),
      });
      expect(valid).toBe(true);
      expect(body).not.toContain('203.0.113.4');
      expect(body).not.toContain('session-secret');
      expect(JSON.parse(body).id).toMatch(/^[A-Za-z0-9_-]{22,64}$/u);
      expect(init?.redirect).toBe('error');
      return jsonResponse(hitReply(JSON.parse(body), () => true));
    });
    const client = createAbuseGuardClient({
      family: 'offline',
      pepper: PEPPER,
      transport: createHttpGuardTransport({
        url: 'https://guard.example.test',
        secret: SECRET,
        timeoutMs: 500,
        fetch: fetchMock as unknown as typeof fetch,
      }),
    });

    await expect(
      client.hitWindows([
        {
          partition: 'ip:203.0.113.4',
          windows: [
            { key: '1m', limit: 1200, windowMs: 60_000, algo: 'sliding' },
          ],
        },
        {
          partition: 'session:session-secret',
          windows: [
            { key: '1m', limit: 600, windowMs: 60_000, algo: 'sliding' },
          ],
        },
      ])
    ).resolves.toMatchObject({ ok: true, remaining: 4, resetAt: 120_000 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('times out a hung store once, without retrying', async () => {
    const fetchMock = vi.fn(
      (_url: URL, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(init.signal?.reason)
          );
        })
    );
    const transport = createHttpGuardTransport({
      url: 'https://guard.example.test',
      secret: SECRET,
      timeoutMs: 100,
      fetch: fetchMock as unknown as typeof fetch,
    });
    const client = createAbuseGuardClient({
      family: 'replay',
      pepper: PEPPER,
      transport,
    });

    const error = await client.get('refresh:jti').catch((caught) => caught);
    expect(error).toBeInstanceOf(AbuseGuardUnavailableError);
    expect(error.code).toBe('timeout');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [401, { error: 'unauthorized' }, 'unauthorized'],
    [503, { error: 'guard_stopped' }, 'guard_stopped'],
    [500, { error: 'something-else' }, 'guard_unavailable'],
  ])('maps HTTP %s to %s', async (status, body, code) => {
    const fetchMock = vi.fn(async () => jsonResponse(body, status));
    const client = createAbuseGuardClient({
      family: 'offline',
      pepper: PEPPER,
      transport: createHttpGuardTransport({
        url: 'https://guard.example.test',
        secret: SECRET,
        timeoutMs: 500,
        fetch: fetchMock as unknown as typeof fetch,
      }),
    });
    await expect(client.get('offline:clearance:x')).rejects.toMatchObject({
      code,
    });
  });

  it('refuses cleartext non-loopback origins before signing or fetching', () => {
    const fetchMock = vi.fn();
    for (const url of [
      'http://guard.example.test',
      'http://10.0.0.2:8797',
      'not a url',
    ]) {
      expect(() =>
        createHttpGuardTransport({
          url,
          secret: SECRET,
          timeoutMs: 500,
          fetch: fetchMock as unknown as typeof fetch,
        })
      ).toThrow(AbuseGuardUnavailableError);
    }
    for (const url of [
      'https://guard.example.test',
      'http://127.0.0.1:8797',
      'http://localhost:8797',
      'http://[::1]:8797',
    ]) {
      expect(() =>
        createHttpGuardTransport({ url, secret: SECRET, timeoutMs: 500 })
      ).not.toThrow();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats a refused redirect as a network failure', async () => {
    const client = createAbuseGuardClient({
      family: 'replay',
      pepper: PEPPER,
      transport: createHttpGuardTransport({
        url: 'https://guard.example.test',
        secret: SECRET,
        timeoutMs: 500,
        fetch: (async () => {
          throw new TypeError('fetch failed: unexpected redirect');
        }) as unknown as typeof fetch,
      }),
    });
    await expect(client.get('k')).rejects.toMatchObject({ code: 'network' });
  });

  it('refuses a weak signing secret before anything is sent', () => {
    expect(() =>
      createHttpGuardTransport({
        url: 'https://guard.example.test',
        secret: 'short',
        timeoutMs: 500,
      })
    ).toThrow(AbuseGuardUnavailableError);
  });

  it('reuses a caller-supplied operation id so a retry cannot double-charge', async () => {
    const ids: string[] = [];
    const client = createAbuseGuardClient({
      family: 'password',
      pepper: PEPPER,
      transport: async (rpc) => {
        ids.push(rpc.id);
        return {
          v: 1,
          steps: [
            {
              results: [
                { op: 'res.reserve', ok: true, remaining: 1, retryAfterMs: 0 },
              ],
            },
          ],
        };
      },
    });
    const operationId = createGuardOperationId();
    const input = {
      partition: 'pwd:meet-guest',
      budgets: [{ key: 'target', limit: 2, ttlMs: 60_000 }],
      receipt: 'r1',
      operationId,
    };
    await client.reserve(input);
    await client.reserve(input);
    expect(ids).toEqual([operationId, operationId]);
    await expect(
      client.incr('k', 1, 60_000, { operationId: 'bad id' })
    ).rejects.toMatchObject({ code: 'bad_request' });
  });

  it('sends a fresh operation id with every call', async () => {
    const ids: string[] = [];
    const client = createAbuseGuardClient({
      family: 'replay',
      pepper: PEPPER,
      transport: async (rpc) => {
        ids.push(rpc.id);
        return { v: 1, steps: [{ results: [{ op: 'kv.get', v: null }] }] };
      },
    });
    await client.get('a');
    await client.get('a');
    expect(new Set(ids).size).toBe(2);
  });

  it('rejects malformed or mismatched replies', async () => {
    const replies = [
      { v: 1, steps: [] },
      { v: 1, steps: [{ results: [{ op: 'kv.ttl', ttlMs: 1 }] }] },
      { nope: true },
    ];
    for (const reply of replies) {
      const client = createAbuseGuardClient({
        family: 'replay',
        pepper: PEPPER,
        transport: async () => reply,
      });
      await expect(client.get('key')).rejects.toMatchObject({
        code: 'invalid_response',
      });
    }
  });

  it('refuses out-of-bounds requests before sending them', async () => {
    const transport = vi.fn();
    const client = createAbuseGuardClient({
      family: 'replay',
      pepper: PEPPER,
      transport,
    });
    await expect(
      client.set('key', 'x'.repeat(4096), { ttlMs: 60_000 })
    ).rejects.toMatchObject({ code: 'bad_request' });
    await expect(client.set('key', 'v', { ttlMs: 10 })).rejects.toMatchObject({
      code: 'bad_request',
    });
    await expect(
      client.mget(Array.from({ length: 17 }, (_, index) => `k${index}`))
    ).rejects.toMatchObject({ code: 'bad_request' });
    expect(transport).not.toHaveBeenCalled();
  });
});

describe('hitWindows', () => {
  it('rejects a hit reply without one result per window', async () => {
    const client = createAbuseGuardClient({
      family: 'offline',
      pepper: PEPPER,
      transport: async () => ({
        v: 1,
        steps: [
          { results: [{ op: 'win.hit', ok: true, resetAt: 1, windows: [] }] },
        ],
      }),
    });
    await expect(
      client.hitWindows([
        {
          partition: 'ip:a',
          windows: [{ key: '1m', limit: 5, windowMs: 60_000, algo: 'fixed' }],
        },
      ])
    ).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('reports the first denied subject and its reset', async () => {
    const client = createAbuseGuardClient({
      family: 'offline',
      pepper: PEPPER,
      transport: async (rpc) => {
        expect(rpc.sequential).toBe(true);
        return hitReply(rpc, (index) => index === 0, 90_000);
      },
    });
    await expect(
      client.hitWindows([
        {
          partition: 'ip:a',
          windows: [{ key: '1m', limit: 1, windowMs: 60_000, algo: 'fixed' }],
        },
        {
          partition: 'session:b',
          windows: [{ key: '1m', limit: 1, windowMs: 60_000, algo: 'fixed' }],
        },
      ])
    ).resolves.toMatchObject({ ok: false, resetAt: 90_000, subjectIndex: 1 });
  });
});

describe('createBindingGuardTransport', () => {
  it('maps binding error payloads and timeouts', async () => {
    const stopped = createBindingGuardTransport(
      { run: async () => ({ error: 'guard_stopped' }) },
      100
    );
    await expect(
      stopped({
        v: 1,
        id: 'op-id-0000000000000000000',
        family: 'password',
        steps: [],
      })
    ).rejects.toMatchObject({ code: 'guard_stopped' });

    const hung = createBindingGuardTransport(
      { run: () => new Promise(() => {}) },
      100
    );
    await expect(
      hung({
        v: 1,
        id: 'op-id-0000000000000000000',
        family: 'password',
        steps: [],
      })
    ).rejects.toMatchObject({ code: 'timeout' });

    const thrown = createBindingGuardTransport(
      {
        run: async () => {
          throw new Error('binding down');
        },
      },
      100
    );
    await expect(
      thrown({
        v: 1,
        id: 'op-id-0000000000000000000',
        family: 'password',
        steps: [],
      })
    ).rejects.toMatchObject({ code: 'network' });
  });
});

describe('selectAbuseGuard', () => {
  const configured = {
    ABUSE_GUARD_URL: 'https://guard.example.test',
    ABUSE_GUARD_SECRET: SECRET,
    ABUSE_GUARD_KEY_PEPPER: PEPPER,
  };

  it('keeps every family on the legacy path by default', () => {
    expect(selectAbuseGuard('offline', configured).kind).toBe('legacy');
    expect(selectAbuseGuard('offline', {}).kind).toBe('legacy');
  });

  it('warns once about unknown family names and keeps them on legacy', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const env = { ...configured, ABUSE_GUARD_FAMILIES: 'Offline,ofline' };
    expect(selectAbuseGuard('offline', env).kind).toBe('legacy');
    expect(selectAbuseGuard('offline', env).kind).toBe('legacy');
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[0]?.[0])).toContain('"Offline"');
    warn.mockRestore();
  });

  it('serves only the families named in ABUSE_GUARD_FAMILIES', () => {
    const env = { ...configured, ABUSE_GUARD_FAMILIES: 'offline, bogus' };
    expect(selectAbuseGuard('offline', env).kind).toBe('durable-object');
    expect(selectAbuseGuard('replay', env).kind).toBe('legacy');
  });

  it('honors the backend override and kill switch', () => {
    const env = { ...configured, ABUSE_GUARD_FAMILIES: 'offline' };
    expect(
      selectAbuseGuard('offline', { ...env, ABUSE_GUARD_BACKEND: 'upstash' })
        .kind
    ).toBe('legacy');
    expect(
      selectAbuseGuard('offline', { ...env, ABUSE_GUARD_BACKEND: 'off' }).kind
    ).toBe('off');
    // `off` never touches unassigned families: they keep the legacy path.
    expect(
      selectAbuseGuard('replay', { ...env, ABUSE_GUARD_BACKEND: 'off' }).kind
    ).toBe('legacy');
    expect(selectAbuseGuard('proxy', { ABUSE_GUARD_BACKEND: 'off' }).kind).toBe(
      'legacy'
    );
  });

  it.each([
    ['missing URL', { ABUSE_GUARD_URL: undefined }],
    ['cleartext URL', { ABUSE_GUARD_URL: 'http://guard.example.test' }],
    ['missing secret', { ABUSE_GUARD_SECRET: undefined }],
    ['short secret', { ABUSE_GUARD_SECRET: 'short' }],
    ['missing pepper', { ABUSE_GUARD_KEY_PEPPER: undefined }],
    ['short pepper', { ABUSE_GUARD_KEY_PEPPER: 'p'.repeat(31) }],
  ])(
    'reports an assigned family with a %s as off, never legacy',
    (_, broken) => {
      const env = { ...configured, ABUSE_GUARD_FAMILIES: 'offline', ...broken };
      expect(selectAbuseGuard('offline', env).kind).toBe('off');
      expect(
        selectAbuseGuard('offline', {
          ...env,
          ABUSE_GUARD_BACKEND: 'durable-object',
        }).kind
      ).toBe('off');
      // An unassigned family is genuinely unconfigured and keeps the legacy path.
      expect(selectAbuseGuard('replay', env).kind).toBe('legacy');
    }
  );

  it('serves loopback HTTP for local verification', () => {
    const env = { ...configured, ABUSE_GUARD_FAMILIES: 'offline' };
    expect(
      selectAbuseGuard('offline', {
        ...env,
        ABUSE_GUARD_URL: 'http://127.0.0.1:8799',
      }).kind
    ).toBe('durable-object');
  });

  it('reports binding-assigned families as off when the pepper is invalid', () => {
    configureAbuseGuardRuntime({
      binding: { run: vi.fn() },
      pepper: 'short',
      families: 'password',
    });
    expect(selectAbuseGuard('password', {}).kind).toBe('off');
    // Even a complete HTTP configuration must not take over an assigned family.
    expect(
      selectAbuseGuard('password', {
        ...configured,
        ABUSE_GUARD_FAMILIES: 'password',
      }).kind
    ).toBe('off');
    expect(selectAbuseGuard('offline', {}).kind).toBe('legacy');
  });

  it('uses an injected service binding for native Workers', async () => {
    const run = vi.fn(async (rpc: GuardRpc) => ({
      v: 1,
      steps: rpc.steps.map(() => ({
        results: [{ op: 'kv.get', v: 'passed' }],
      })),
    }));
    const binding = { run };
    configureAbuseGuardRuntime({
      binding,
      pepper: PEPPER,
      families: 'password',
    });
    const selection = selectAbuseGuard('password', {});
    expect(selection.kind).toBe('durable-object');
    expect(selectAbuseGuard('offline', {}).kind).toBe('legacy');
    if (selection.kind !== 'durable-object') return;
    await expect(selection.client.get('k')).resolves.toBe('passed');
    expect(run).toHaveBeenCalledTimes(1);

    // Re-configuring with the same per-request input keeps the cached client.
    configureAbuseGuardRuntime({
      binding,
      pepper: PEPPER,
      families: 'password',
    });
    const again = selectAbuseGuard('password', {});
    expect(again.kind === 'durable-object' && again.client).toBe(
      selection.client
    );
  });
});

describe('request-scoped fairness identities', () => {
  it('purpose-hashes source/principal independently of keys and never mutates the shared client', async () => {
    const sent: GuardRpc[] = [];
    const shared = createAbuseGuardClient({
      family: 'replay',
      pepper: PEPPER,
      transport: async (rpc) => {
        sent.push(rpc);
        return { v: 1, steps: [{ results: [{ op: 'kv.get', v: null }] }] };
      },
    });
    await Promise.all([
      shared
        .withFairness({ source: '203.0.113.4', principal: 'user-a' })
        .get('token-a'),
      shared
        .withFairness({ source: '203.0.113.4', principal: 'user-b' })
        .get('token-b'),
    ]);
    expect(sent[0]?.fairness?.source).toEqual(sent[1]?.fairness?.source);
    expect(sent[0]?.fairness?.source).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(sent[0]?.fairness?.principal).not.toEqual(
      sent[1]?.fairness?.principal
    );
    expect(JSON.stringify(sent)).not.toContain('203.0.113.4');
    expect(JSON.stringify(sent)).not.toContain('user-a');
    await shared.get('unscoped');
    expect(sent[2]?.fairness).toBeUndefined();
    const identity = { source: '203.0.113.4', principal: 'user-a' };
    const view = shared.withFairness(identity);
    identity.principal = 'user-b';
    await view.get('stable-view');
    expect(sent[3]?.fairness).toEqual(sent[0]?.fairness);
  });
});
