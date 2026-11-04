import { afterEach, describe, expect, it, vi } from 'vitest';
import { purgeRendererPage, rendererPurgeTarget } from './renderer-purge';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const scope = { workspaceId, siteId: 'first-site', version: 'old-version' };
function configure() {
  vi.stubEnv(
    'CMS_RENDERER_SITES',
    JSON.stringify({
      'first-site.example': {
        id: 'first-site',
        workspaceId,
        defaultLocale: 'vi',
        purgeToken: 'a'.repeat(43),
      },
    })
  );
}
afterEach(() => vi.unstubAllEnvs());
describe('renderer purge', () => {
  it.each([
    ['home', '/', 'vi'],
    ['en', '/en', 'en'],
    ['en/about/', '/en/about', 'en'],
  ])('maps %s to its full public path', (slug, path, locale) => {
    configure();
    expect(rendererPurgeTarget({ ...scope, slug })).toMatchObject({
      url: 'https://first-site.example/__cms/purge',
      body: { path, locale, version: 'old-version' },
    });
  });
  it('denies missing config, secrets, and another site or workspace', () => {
    configure();
    expect(() =>
      rendererPurgeTarget({ ...scope, siteId: 'another-site', slug: 'home' })
    ).toThrow();
    expect(() =>
      rendererPurgeTarget({ ...scope, workspaceId: 'other', slug: 'home' })
    ).toThrow();
    vi.stubEnv(
      'CMS_RENDERER_SITES',
      JSON.stringify({
        'first-site.example': {
          id: 'first-site',
          workspaceId,
          defaultLocale: 'vi',
        },
      })
    );
    expect(() => rendererPurgeTarget({ ...scope, slug: 'home' })).toThrow();
  });
  it('sends one authenticated request for the previous cache version', async () => {
    configure();
    const send = vi.fn(async () => new Response(null, { status: 204 }));
    expect(
      await purgeRendererPage(
        rendererPurgeTarget({ ...scope, slug: 'en/about' }),
        send
      )
    ).toBe('purged');
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(
      'https://first-site.example/__cms/purge',
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${'a'.repeat(43)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          path: '/en/about',
          locale: 'en',
          version: 'old-version',
        }),
      })
    );
  });
  it('selects only the trusted origin token and rejects duplicate or short tokens', () => {
    const sites = {
      'first-site.example': {
        id: 'first-site',
        workspaceId,
        defaultLocale: 'vi',
        purgeToken: 'a'.repeat(43),
      },
      'second-site.example': {
        id: 'second-site',
        workspaceId,
        defaultLocale: 'vi',
        purgeToken: 'b'.repeat(43),
      },
    };
    vi.stubEnv('CMS_RENDERER_SITES', JSON.stringify(sites));
    expect(rendererPurgeTarget({ ...scope, slug: 'home' }).token).toBe(
      'a'.repeat(43)
    );
    expect(
      rendererPurgeTarget({ ...scope, siteId: 'second-site', slug: 'home' })
        .token
    ).toBe('b'.repeat(43));
    sites['second-site.example'].purgeToken = 'a'.repeat(43);
    vi.stubEnv('CMS_RENDERER_SITES', JSON.stringify(sites));
    expect(() => rendererPurgeTarget({ ...scope, slug: 'home' })).toThrow();
    sites['second-site.example'].purgeToken = 'short';
    vi.stubEnv('CMS_RENDERER_SITES', JSON.stringify(sites));
    expect(() => rendererPurgeTarget({ ...scope, slug: 'home' })).toThrow();
  });
  it.each(['{', '{"bad":{}}'])(
    'wraps invalid server config as a server error: %s',
    (config) => {
      vi.stubEnv('CMS_RENDERER_SITES', config);
      try {
        rendererPurgeTarget({ ...scope, slug: 'home' });
        throw new Error('expected rejection');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        if (!(error instanceof Error)) throw error;
        expect(error.constructor).toBe(Error);
      }
    }
  );
  it('reports rejection and network failure without retrying', async () => {
    configure();
    const target = rendererPurgeTarget({ ...scope, slug: 'home' });
    const send = vi.fn(async () => new Response(null, { status: 403 }));
    expect(await purgeRendererPage(target, send)).toBe('failed');
    expect(send).toHaveBeenCalledOnce();
    send.mockRejectedValueOnce(new Error('network'));
    expect(await purgeRendererPage(target, send)).toBe('failed');
    expect(send).toHaveBeenCalledTimes(2);
  });
});
