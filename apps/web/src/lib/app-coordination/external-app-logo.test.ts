import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearExternalAppLogoCache,
  EXTERNAL_APP_LOGO_HIT_TTL_MS,
  EXTERNAL_APP_LOGO_MAX_BYTES,
  EXTERNAL_APP_LOGO_MISS_TTL_MS,
  externalAppLogoPath,
  externalAppLogoVersion,
  fetchExternalAppLogo,
  getCachedExternalAppLogo,
} from './external-app-logo';

const LOGO = 'https://cdn.example.net/logo.png';
const png = new Uint8Array([137, 80, 78, 71]);

function respond(
  body: BodyInit | null,
  init: ResponseInit & { headers?: Record<string, string> } = {}
) {
  return vi.fn(async () => new Response(body, init)) as unknown as typeof fetch;
}

describe('fetchExternalAppLogo', () => {
  it('returns a raster image within the cap', async () => {
    const fetchImpl = respond(png, {
      headers: { 'content-type': 'image/png' },
    });
    await expect(fetchExternalAppLogo(LOGO, fetchImpl)).resolves.toEqual({
      body: png,
      contentType: 'image/png',
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      LOGO,
      expect.objectContaining({ redirect: 'manual' })
    );
  });

  it.each([
    'http://cdn.example.net/logo.png',
    'https://127.0.0.1/logo.png',
    'https://localhost/logo.png',
    null,
  ])('never fetches the disallowed URL %s', async (url) => {
    const fetchImpl = respond(png, {
      headers: { 'content-type': 'image/png' },
    });
    await expect(fetchExternalAppLogo(url, fetchImpl)).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each<[string, { headers?: Record<string, string>; status?: number }]>([
    ['an SVG', { headers: { 'content-type': 'image/svg+xml' } }],
    ['HTML', { headers: { 'content-type': 'text/html' } }],
    ['no type', {}],
    ['a redirect', { status: 302, headers: { location: 'https://x.test' } }],
    ['an error', { status: 404, headers: { 'content-type': 'image/png' } }],
  ])('refuses %s', async (_name, init) => {
    await expect(
      fetchExternalAppLogo(
        LOGO,
        respond(init.status === 302 ? null : png, init)
      )
    ).resolves.toBeNull();
  });

  it('refuses an image over the cap, declared or streamed', async () => {
    const big = new Uint8Array(EXTERNAL_APP_LOGO_MAX_BYTES + 1);
    await expect(
      fetchExternalAppLogo(
        LOGO,
        respond(big, { headers: { 'content-type': 'image/png' } })
      )
    ).resolves.toBeNull();
    await expect(
      fetchExternalAppLogo(
        LOGO,
        respond(png, {
          headers: {
            'content-length': String(EXTERNAL_APP_LOGO_MAX_BYTES + 1),
            'content-type': 'image/png',
          },
        })
      )
    ).resolves.toBeNull();
  });

  it('returns null when the fetch throws', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('timeout');
    }) as unknown as typeof fetch;
    await expect(fetchExternalAppLogo(LOGO, fetchImpl)).resolves.toBeNull();
  });

  it('builds a same-origin path versioned by the logo URL', async () => {
    const path = await externalAppLogoPath('edufest', LOGO);
    expect(path).toMatch(
      /^\/api\/v1\/auth\/external-app-logo\/edufest\/[0-9a-f]{16}$/u
    );
    expect(path).toBe(await externalAppLogoPath('edufest', LOGO));
    expect(path).not.toBe(
      await externalAppLogoPath('edufest', 'https://cdn.example.net/new.png')
    );
    expect(path.endsWith(await externalAppLogoVersion(LOGO))).toBe(true);
  });
});

describe('getCachedExternalAppLogo', () => {
  beforeEach(() => clearExternalAppLogoCache());

  it('fetches once for concurrent and repeated requests within the TTL', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(png, { headers: { 'content-type': 'image/png' } })
    ) as unknown as typeof fetch;
    await Promise.all([
      getCachedExternalAppLogo(LOGO, { fetchImpl, now: 0 }),
      getCachedExternalAppLogo(LOGO, { fetchImpl, now: 0 }),
    ]);
    await getCachedExternalAppLogo(LOGO, {
      fetchImpl,
      now: EXTERNAL_APP_LOGO_HIT_TTL_MS - 1,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await getCachedExternalAppLogo(LOGO, {
      fetchImpl,
      now: EXTERNAL_APP_LOGO_HIT_TTL_MS + 1,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('keeps a failed fetch only for the short miss TTL', async () => {
    const fetchImpl = respond(null, { status: 500 });
    await getCachedExternalAppLogo(LOGO, { fetchImpl, now: 0 });
    await getCachedExternalAppLogo(LOGO, {
      fetchImpl,
      now: EXTERNAL_APP_LOGO_MISS_TTL_MS - 1,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await getCachedExternalAppLogo(LOGO, {
      fetchImpl,
      now: EXTERNAL_APP_LOGO_MISS_TTL_MS + 1,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
