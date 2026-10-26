// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AbuseGuardUnavailableError,
  createAbuseGuardClient,
  createBindingGuardTransport,
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
            windows: ok ? [{ remaining: 5 - index, resetAt }] : [],
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
    ).resolves.toEqual({ ok: true, remaining: 4, resetAt: 120_000 });
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
    ).resolves.toEqual({ ok: false, resetAt: 90_000, subjectIndex: 1 });
  });
});

describe('createBindingGuardTransport', () => {
  it('maps binding error payloads and timeouts', async () => {
    const stopped = createBindingGuardTransport(
      { run: async () => ({ error: 'guard_stopped' }) },
      100
    );
    await expect(
      stopped({ v: 1, family: 'password', steps: [] })
    ).rejects.toMatchObject({ code: 'guard_stopped' });

    const hung = createBindingGuardTransport(
      { run: () => new Promise(() => {}) },
      100
    );
    await expect(
      hung({ v: 1, family: 'password', steps: [] })
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
      thrown({ v: 1, family: 'password', steps: [] })
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
  });

  it('never selects a weak or insecure configuration', () => {
    const env = { ...configured, ABUSE_GUARD_FAMILIES: 'offline' };
    expect(
      selectAbuseGuard('offline', { ...env, ABUSE_GUARD_SECRET: 'short' }).kind
    ).toBe('legacy');
    expect(
      selectAbuseGuard('offline', {
        ...env,
        ABUSE_GUARD_URL: 'http://guard.example.test',
      }).kind
    ).toBe('legacy');
    expect(
      selectAbuseGuard('offline', {
        ...env,
        ABUSE_GUARD_BACKEND: 'durable-object',
        ABUSE_GUARD_KEY_PEPPER: undefined,
      }).kind
    ).toBe('off');
    expect(
      selectAbuseGuard('offline', {
        ...env,
        ABUSE_GUARD_URL: 'http://127.0.0.1:8799',
      }).kind
    ).toBe('durable-object');
  });

  it('uses an injected service binding for native Workers', async () => {
    const run = vi.fn(async (rpc: GuardRpc) => ({
      v: 1,
      steps: rpc.steps.map(() => ({
        results: [{ op: 'kv.get', v: 'passed' }],
      })),
    }));
    configureAbuseGuardRuntime({
      binding: { run },
      pepper: PEPPER,
      families: 'password',
    });
    const selection = selectAbuseGuard('password', {});
    expect(selection.kind).toBe('durable-object');
    expect(selectAbuseGuard('offline', {}).kind).toBe('legacy');
    if (selection.kind !== 'durable-object') return;
    await expect(selection.client.get('k')).resolves.toBe('passed');
    expect(run).toHaveBeenCalledTimes(1);
  });
});
