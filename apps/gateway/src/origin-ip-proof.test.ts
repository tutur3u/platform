import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createOriginClientIpProof as createUtilsProof,
  verifyOriginClientIpProof,
} from '../../../packages/utils/src/abuse-protection/origin-ip-proof';
import { manifest } from './manifest';
import {
  createOriginClientIpProof,
  ORIGIN_AUTH_HEADER,
  ORIGIN_WORKER_HEADER,
  resetOriginAuthWarning,
} from './origin-ip-proof';
import { dispatchWebFamily } from './web-family';
import { withWebRest } from './web-rest.test-helper';
import { type CacheLike, createHandler, type Env } from './worker';

const SECRET = 'synthetic-gateway-origin-secret-at-least-32';
const OTHER_SECRET = 'other-synthetic-origin-secret-at-least-32';
const VISITOR = '203.0.113.42';

const ENV: Env = {
  PUBLIC_HOST: 'tuturuuu.com',
  TRUSTED_PROXY_ORIGIN_SECRET: SECRET,
  ...withWebRest(),
};

class MemoryCache implements CacheLike {
  entries = new Map<string, Response>();
  async match(request: Request) {
    return this.entries.get(request.url)?.clone();
  }
  async put(request: Request, response: Response) {
    this.entries.set(request.url, response);
  }
}

function setup() {
  const seen: Request[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: Request) => {
      seen.push(input);
      return new Response('origin');
    })
  );
  const cache = new MemoryCache();
  const handle = createHandler({ cache: () => cache, now: () => 0, manifest });
  return { seen, handle };
}

/** A client that sends every spoofable address header plus its own proof. */
async function spoofedRequest(path: string, init: RequestInit = {}) {
  const forged = await createOriginClientIpProof({
    ip: '198.51.100.66',
    secret: OTHER_SECRET,
  });
  return new Request(`https://tuturuuu.com${path}`, {
    method: 'POST',
    ...init,
    headers: {
      'cf-connecting-ip': VISITOR,
      'x-forwarded-for': '198.51.100.1',
      'x-real-ip': '198.51.100.2',
      'true-client-ip': '198.51.100.3',
      'x-vercel-forwarded-for': '198.51.100.4',
      [ORIGIN_AUTH_HEADER]: forged ?? '',
    },
  });
}

const verify = (proof: string | null, secret = SECRET) =>
  verifyOriginClientIpProof({ proof, secret });

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  resetOriginAuthWarning();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('origin IP proof parity with @tuturuuu/utils', () => {
  it.each([
    '203.0.113.42',
    ' 203.0.113.42:8443 ',
    '2001:DB8::1',
    '[2001:db8::1]:443',
    'fe80::1%eth0',
    '::ffff:192.0.2.1',
  ])('signs %s exactly as the shared implementation', async (ip) => {
    for (const nowSeconds of [1_700_000_000, 1_800_000_123]) {
      const ours = await createOriginClientIpProof({
        ip,
        secret: SECRET,
        nowSeconds,
      });
      expect(ours).not.toBeNull();
      expect(ours).toBe(createUtilsProof({ ip, secret: SECRET, nowSeconds }));
    }
  });

  it.each(['', 'not-an-ip', '256.0.0.1', '1:2:3:4:5:6:7:8:9'])(
    'refuses invalid address %j like the shared implementation',
    async (ip) => {
      expect(await createOriginClientIpProof({ ip, secret: SECRET })).toBe(
        null
      );
      expect(createUtilsProof({ ip, secret: SECRET })).toBe(null);
    }
  );

  it('refuses a secret shorter than 32 characters', async () => {
    const secret = 'x'.repeat(31);
    expect(await createOriginClientIpProof({ ip: VISITOR, secret })).toBe(null);
  });
});

describe('gateway origin proof', () => {
  it('signs the edge cf-connecting-ip on web-rest family requests', async () => {
    const { seen, handle } = setup();
    await handle(await spoofedRequest('/api/v1/anything'), ENV);
    expect(seen).toHaveLength(1);
    const proof = seen[0]?.headers.get(ORIGIN_AUTH_HEADER) ?? null;
    expect(verify(proof)).toBe(VISITOR);
    expect(verify(proof, OTHER_SECRET)).toBe(null);
  });

  it('signs unflagged page groups and unmatched paths on web-rest', async () => {
    const { seen, handle } = setup();
    await handle(await spoofedRequest('/privacy', { method: 'GET' }), ENV);
    await handle(await spoofedRequest('/x'), ENV);
    expect(seen).toHaveLength(2);
    for (const request of seen) {
      expect(new URL(request.url).host).toBe('tuturuuu.com');
    }
    for (const request of seen) {
      expect(verify(request.headers.get(ORIGIN_AUTH_HEADER))).toBe(VISITOR);
    }
  });

  it('sends no proof without a usable secret and warns once without it', async () => {
    for (const secret of [undefined, '', 'short-secret']) {
      resetOriginAuthWarning();
      warn.mockClear();
      const { seen, handle } = setup();
      const env = { ...ENV, TRUSTED_PROXY_ORIGIN_SECRET: secret };
      await handle(await spoofedRequest('/a'), env);
      await handle(await spoofedRequest('/b'), env);
      for (const request of seen) {
        expect(request.headers.has(ORIGIN_AUTH_HEADER)).toBe(false);
      }
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).not.toContain(SECRET);
    }
  });

  it('sends no proof for an invalid edge address', async () => {
    const { seen, handle } = setup();
    await handle(
      new Request('https://tuturuuu.com/a', {
        method: 'POST',
        headers: { 'cf-connecting-ip': 'garbage', 'x-forwarded-for': VISITOR },
      }),
      ENV
    );
    expect(seen[0]?.headers.has(ORIGIN_AUTH_HEADER)).toBe(false);
  });

  it('never sends a proof to the Marketing origin', async () => {
    const { seen, handle } = setup();
    const env: Env = {
      ...ENV,
      MARKETING_ORIGIN: 'https://marketing-origin.example',
      GATEWAY_MARKETING_GROUPS: 'legal',
    };
    await handle(await spoofedRequest('/privacy', { method: 'GET' }), env);
    expect(new URL(seen[0]?.url ?? '').host).toBe('marketing-origin.example');
    expect(seen[0]?.headers.has(ORIGIN_AUTH_HEADER)).toBe(false);
  });

  it('never sends a proof to a mounted app', async () => {
    setup();
    const mount = vi.fn(async (_request: Request) => new Response('mounted'));
    const handle = createHandler({
      cache: () => new MemoryCache(),
      now: () => 0,
      manifest,
    });
    await handle(await spoofedRequest('/learn'), {
      ...ENV,
      GATEWAY_MOUNTED_PATHS: '/learn',
      MOUNT_LEARN: { fetch: mount },
    } as unknown as Env);
    expect(mount).toHaveBeenCalledTimes(1);
    expect(mount.mock.calls[0]?.[0].headers.has(ORIGIN_AUTH_HEADER)).toBe(
      false
    );
  });

  it('forwards the calling Worker zone only beside its own proof', async () => {
    const { seen, handle } = setup();
    const fromWorker = (extra: Record<string, string>) =>
      new Request('https://tuturuuu.com/api/v1/x', {
        method: 'POST',
        headers: {
          'cf-connecting-ip': '2a06:98c0:3600::103',
          [ORIGIN_WORKER_HEADER]: 'forged.example',
          ...extra,
        },
      });
    await handle(fromWorker({ 'cf-worker': 'caller.example' }), ENV);
    await handle(fromWorker({}), ENV);
    await handle(fromWorker({ 'cf-worker': 'caller.example' }), {
      ...ENV,
      TRUSTED_PROXY_ORIGIN_SECRET: undefined,
    });
    expect(seen.map((r) => r.headers.get(ORIGIN_WORKER_HEADER))).toEqual([
      'caller.example',
      null,
      null,
    ]);
  });

  it('signs the edge address on web family requests', async () => {
    const family = vi.fn(async (_request: Request) => new Response('family'));
    await dispatchWebFamily(
      await spoofedRequest('/api/v1/auth'),
      { id: 'api-identity', binding: { fetch: family }, path: '/api/v1/auth' },
      ENV
    );
    const proof = family.mock.calls[0]?.[0].headers.get(ORIGIN_AUTH_HEADER);
    expect(verify(proof ?? null)).toBe(VISITOR);
    family.mockClear();
    await dispatchWebFamily(
      await spoofedRequest('/api/v1/auth'),
      { id: 'api-identity', binding: { fetch: family }, path: '/api/v1/auth' },
      { ...ENV, TRUSTED_PROXY_ORIGIN_SECRET: undefined }
    );
    expect(family.mock.calls[0]?.[0].headers.has(ORIGIN_AUTH_HEADER)).toBe(
      false
    );
  });
});
