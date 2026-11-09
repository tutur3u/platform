import { afterEach, expect, test, vi } from 'vitest';
import type { Owner } from './auth';
import { hasLiveRootAccess } from './permission';

const owner: Owner = {
  id: 'fixture-owner',
  email: 'owner@example.invalid',
  token: 'synthetic-session',
  expiresAt: Date.now() + 300_000,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test.each([200, 201, 202, 299])(
  'accepts a validated grant on HTTP %i without following redirects',
  async (status) => {
    const fetch = vi
      .fn()
      .mockResolvedValue(Response.json({ enabled: true }, { status }));
    vi.stubGlobal('fetch', fetch);
    expect(await hasLiveRootAccess(owner)).toBe(true);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      'https://tuturuuu.com/api/v1/mastermind/access',
      expect.objectContaining({ redirect: 'manual' })
    );
  }
);

test.each([300, 301, 302, 303, 307, 308, 400, 401, 403, 500])(
  'denies HTTP %i before parsing a grant body',
  async (status) => {
    const response = Response.json({ enabled: true }, { status });
    const json = vi.spyOn(response, 'json');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    expect(await hasLiveRootAccess(owner)).toBe(false);
    expect(json).not.toHaveBeenCalled();
  }
);

test('denies an opaque redirect before parsing a grant body', async () => {
  const response = Response.json({ enabled: true });
  Object.defineProperty(response, 'type', { value: 'opaqueredirect' });
  const json = vi.spyOn(response, 'json');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
  expect(await hasLiveRootAccess(owner)).toBe(false);
  expect(json).not.toHaveBeenCalled();
});

test('denies a successful response without a grant', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json({ enabled: false }))
  );
  expect(await hasLiveRootAccess(owner)).toBe(false);
});

test('denies a malformed grant', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json({ enabled: 'true' }))
  );
  expect(await hasLiveRootAccess(owner)).toBe(false);
});

test('denies malformed JSON', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('invalid JSON'))
  );
  expect(await hasLiveRootAccess(owner)).toBe(false);
});

test('denies a network failure', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValue(new Error('Synthetic network failure'))
  );
  expect(await hasLiveRootAccess(owner)).toBe(false);
});
