import { afterEach, expect, it, vi } from 'vitest';
import { maintainLiveRegistry } from '../../cloudflare/live/registry-heartbeat';
import type { SavedSession } from '../../cloudflare/live/session-state';
import type { LiveEnvironment } from '../../cloudflare/live/storage';

it('survives a transient registry outage but stops before privacy discoverability expires', async () => {
  const fetch = vi.fn(async () => new Response(null, { status: 503 }));
  const env = {
    MEET_LIVE: { idFromName: (value: string) => value, get: () => ({ fetch }) },
  } as unknown as LiveEnvironment;
  const saved = {
    claims: { ownerId: 'owner' },
    startedAt: Date.now() - 13 * 3600000,
  } as SavedSession;
  await expect(maintainLiveRegistry(env, saved)).resolves.toBeUndefined();
  saved.startedAt = Date.now() - 23 * 3600000;
  await expect(maintainLiveRegistry(env, saved)).rejects.toThrow(
    'registry unavailable'
  );
  fetch.mockResolvedValue(new Response(null, { status: 200 }));
  await maintainLiveRegistry(env, saved);
  expect(saved.registryUpdatedAt).toBeGreaterThan(saved.startedAt);
});

it('fails closed when the registry permanently rejects an undiscoverable session', async () => {
  const fetch = vi.fn(async () => new Response(null, { status: 409 }));
  const env = {
    MEET_LIVE: { idFromName: (value: string) => value, get: () => ({ fetch }) },
  } as unknown as LiveEnvironment;
  await expect(
    maintainLiveRegistry(env, {
      claims: { ownerId: 'owner' },
      startedAt: Date.now() - 13 * 3600000,
    } as SavedSession)
  ).rejects.toThrow('registry unavailable');
});

it('does not suppress failed removal after a concurrent session stop', async () => {
  const saved = {
    claims: { ownerId: 'owner' },
    startedAt: Date.now() - 13 * 3600000,
  } as SavedSession;
  const fetch = vi.fn(async (url: string) => {
    if (url.endsWith('/register')) {
      saved.ended = true;
      return new Response(null);
    }
    return new Response(null, { status: 503 });
  });
  const env = {
    MEET_LIVE: { idFromName: (v: string) => v, get: () => ({ fetch }) },
  } as unknown as LiveEnvironment;
  await expect(maintainLiveRegistry(env, saved)).rejects.toThrow(
    'registry unavailable'
  );
});

const hour = 3_600_000;
const clock = 1_800_000_000_000;
afterEach(() => vi.restoreAllMocks());

function registryFixture(status = 200) {
  const fetch = vi.fn(async () => new Response(null, { status }));
  const env = {
    MEET_LIVE: { idFromName: (value: string) => value, get: () => ({ fetch }) },
  } as unknown as LiveEnvironment;
  const saved = {
    claims: { ownerId: 'owner' },
    startedAt: clock - 24 * hour,
    registryUpdatedAt: clock - 12 * hour,
  } as SavedSession;
  return { fetch, env, saved };
}

it.each([NaN, Infinity, -1, Number.MAX_SAFE_INTEGER + 1, clock + 1])(
  'rejects invalid renewal timestamp %s before I/O across reconstruction',
  async (timestamp) => {
    vi.spyOn(Date, 'now').mockReturnValue(clock);
    const { fetch, env, saved } = registryFixture();
    saved.registryUpdatedAt = timestamp;
    for (let i = 0; i < 24; i++)
      await expect(
        maintainLiveRegistry(env, structuredClone(saved))
      ).rejects.toThrow('registry unavailable');
    expect(fetch).not.toHaveBeenCalled();
    expect(saved.registryUpdatedAt).toBe(timestamp);
  }
);

it.each([NaN, Infinity, -1, clock + 1])(
  'rejects invalid session start %s even with a valid renewal',
  async (timestamp) => {
    vi.spyOn(Date, 'now').mockReturnValue(clock);
    const { fetch, env, saved } = registryFixture();
    saved.startedAt = timestamp;
    await expect(maintainLiveRegistry(env, saved)).rejects.toThrow(
      'registry unavailable'
    );
    expect(fetch).not.toHaveBeenCalled();
  }
);

it('rejects a renewal predating admission without replenishing the lease', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(clock);
  const { fetch, env, saved } = registryFixture();
  saved.registryUpdatedAt = saved.startedAt - 1;
  await expect(maintainLiveRegistry(env, saved)).rejects.toThrow(
    'registry unavailable'
  );
  expect(fetch).not.toHaveBeenCalled();
});

it('renews at exactly twelve hours and suppresses persisted duplicate renewals', async () => {
  const now = vi.spyOn(Date, 'now').mockReturnValue(clock - 1);
  const { fetch, env, saved } = registryFixture();
  await maintainLiveRegistry(env, saved);
  expect(fetch).not.toHaveBeenCalled();
  now.mockReturnValue(clock);
  await maintainLiveRegistry(env, saved);
  for (let i = 0; i < 24; i++)
    await maintainLiveRegistry(env, structuredClone(saved));
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(saved.registryUpdatedAt).toBe(clock);
});

it('preserves the exact twenty-three-hour failure boundary', async () => {
  const now = vi.spyOn(Date, 'now').mockReturnValue(clock - 1);
  const { fetch, env, saved } = registryFixture(503);
  saved.registryUpdatedAt = clock - 23 * hour;
  await maintainLiveRegistry(env, saved);
  now.mockReturnValue(clock);
  await expect(maintainLiveRegistry(env, saved)).rejects.toThrow(
    'registry unavailable'
  );
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('retains ended-session removal despite invalid lease clocks', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(clock);
  const { fetch, env, saved } = registryFixture();
  saved.ended = true;
  saved.registryUpdatedAt = Infinity;
  await maintainLiveRegistry(env, saved);
  expect(fetch).toHaveBeenCalledExactlyOnceWith(
    'https://live.internal/registry/remove',
    expect.objectContaining({ method: 'POST' })
  );
});
