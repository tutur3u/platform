import { describe, expect, it, vi } from 'vitest';
import {
  EXTERNAL_APP_LOGO_MAX_BYTES,
  externalAppLogoPath,
  fetchExternalAppLogo,
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

  it.each([
    ['an SVG', { headers: { 'content-type': 'image/svg+xml' } }],
    ['HTML', { headers: { 'content-type': 'text/html' } }],
    ['no type', {}],
    ['a redirect', { status: 302, headers: { location: 'https://x.test' } }],
    ['an error', { status: 404, headers: { 'content-type': 'image/png' } }],
  ] as const)('refuses %s', async (_name, init) => {
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

  it('builds an encoded same-origin path', () => {
    expect(externalAppLogoPath('edufest')).toBe(
      '/api/v1/auth/external-app-logo/edufest'
    );
  });
});
