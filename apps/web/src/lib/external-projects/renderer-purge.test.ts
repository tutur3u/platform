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
      },
    })
  );
  vi.stubEnv('CMS_PURGE_TOKEN', 'test-only-token');
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
    vi.stubEnv('CMS_PURGE_TOKEN', '');
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
          Authorization: 'Bearer test-only-token',
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
