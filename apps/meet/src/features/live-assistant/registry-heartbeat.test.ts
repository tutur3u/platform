import { expect, it, vi } from 'vitest';
import { maintainLiveRegistry } from '../../../cloudflare/live/registry-heartbeat';
import type { SavedSession } from '../../../cloudflare/live/session-state';
import type { LiveEnvironment } from '../../../cloudflare/live/storage';

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
