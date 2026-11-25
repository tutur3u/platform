// @vitest-environment node
import { withSettledResponse } from '@tuturuuu/utils/worker-settled-fetch';
import { describe, expect, it, vi } from 'vitest';
import {
  isUnroutableLettinPath,
  lettinHeadersTimeoutMs,
} from './request-gate';

describe('isUnroutableLettinPath', () => {
  it.each([
    '/getcfg.php',
    '/index.php',
    '/wp-login.php',
    '/en/.env',
    '/.git/config',
    '/index.php/x',
    '/en/%2E%2E%2Fetc',
    '/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php',
    '/api/v1/lettin/config.json',
  ])('fences %s', (path) => {
    expect(isUnroutableLettinPath(new URL(path, 'https://lettin.test'))).toBe(
      true
    );
  });

  it.each([
    '/',
    '/en',
    '/vi/worlds',
    '/en/worlds/7d3e1c64-0f5e-4c2a-9b9b-2f3f8a1d5e10',
    '/en/creators/some_handle',
    '/en/my-workspace/wiki/7d3e1c64-0f5e-4c2a-9b9b-2f3f8a1d5e10/lore',
    '/api/v1/lettin/health',
    '/api/v1/workspaces/personal/lettin/export',
    '/_next/static/chunks/main.js',
    '/_next/image',
  ])('admits %s', (path) => {
    expect(isUnroutableLettinPath(new URL(path, 'https://lettin.test'))).toBe(
      false
    );
  });
});

describe('lettinHeadersTimeoutMs', () => {
  it.each([
    '/api/v1/workspaces/personal/lettin/import',
    '/api/v1/workspaces/7d3e1c64-0f5e-4c2a-9b9b-2f3f8a1d5e10/lettin/exocorpse',
    '/api/v1/workspaces/my-studio/lettin/export',
    '/api/v1/workspaces/my-studio/lettin/media',
  ])('keeps no backstop for long-running %s', (path) => {
    expect(lettinHeadersTimeoutMs(new URL(path, 'https://lettin.test'))).toBe(
      null
    );
  });

  it.each([
    '/en',
    '/api/v1/lettin/health',
    '/api/v1/workspaces/my-studio/lettin',
    '/api/v1/workspaces/my-studio/lettin/moderation',
    '/api/v1/workspaces/my-studio/lettin/import/extra',
  ])('backstops %s at 60 s', (path) => {
    expect(lettinHeadersTimeoutMs(new URL(path, 'https://lettin.test'))).toBe(
      60_000
    );
  });
});

describe('Lettin Worker entry', () => {
  const nextFetch = vi.fn(async () => new Response('page'));
  const fetch = withSettledResponse(nextFetch, {
    app: 'lettin',
    isUnroutable: isUnroutableLettinPath,
    headersTimeoutMs: lettinHeadersTimeoutMs,
  });
  const ctx = { waitUntil: () => undefined };

  it.each([
    ['POST', 'https://lettin.tuturuuu.com/getcfg.php'],
    ['GET', 'https://lettin.tuturuuu.com/index.php/%0Atest'],
  ])('answers scanner %s %s with a fast 404 outside the bridge', async (method, url) => {
    const started = performance.now();
    const response = await fetch(
      new Request(url, method === 'POST' ? { method, body: 'a=b' } : { method }),
      {},
      ctx
    );
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(performance.now() - started).toBeLessThan(100);
    expect(nextFetch).not.toHaveBeenCalled();
  });

  it('hands real routes to the bridge', async () => {
    const response = await fetch(
      new Request('https://lettin.tuturuuu.com/en/worlds'),
      {},
      ctx
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('page');
    expect(nextFetch).toHaveBeenCalledOnce();
  });
});
