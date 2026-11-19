import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadConstants(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const name of [
    'STOREFRONT_APP_URL',
    'NEXT_PUBLIC_STOREFRONT_APP_URL',
    'NEXT_PUBLIC_APP_URL',
    'BASE_URL',
  ]) {
    vi.stubEnv(name, env[name] ?? '');
  }
  vi.stubEnv('NODE_ENV', env.NODE_ENV ?? 'production');
  return import('./common');
}

describe('storefront public URL', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to the canonical store host in production', async () => {
    const { STOREFRONT_APP_URL, BASE_URL } = await loadConstants({});

    expect(STOREFRONT_APP_URL).toBe('https://store.tuturuuu.com');
    expect(BASE_URL).toBe('https://store.tuturuuu.com');
  });

  it('prefers the configured public app URL', async () => {
    const { STOREFRONT_APP_URL } = await loadConstants({
      NEXT_PUBLIC_APP_URL: 'https://store.tuturuuu.com/',
    });

    expect(STOREFRONT_APP_URL).toBe('https://store.tuturuuu.com');
  });
});
