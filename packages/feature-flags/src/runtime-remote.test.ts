import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRemoteRuntimeReader } from './runtime-remote';

const key = 'MEET_UX_V2';
const etag = '"snapshot-1"';
const workspaceId = 'aaaaaaaa-0000-4000-8000-000000000001';

function currentSnapshot() {
  return Response.json(
    {
      environment: 'production',
      version: '0123456789abcdef0123456789abcdef',
      rules: [
        {
          flagKey: key,
          scope: 'platform',
          subjectId: null,
          mode: 'on',
          revision: 1,
        },
      ],
    },
    { headers: { ETag: etag } }
  );
}

function setup() {
  let time = 0;
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(async () => currentSnapshot());
  const env: Record<string, string | undefined> = {
    FEATURE_FLAGS_SNAPSHOT_URL:
      'https://example.test/api/v1/feature-flags/snapshot',
    FEATURE_FLAGS_SNAPSHOT_TOKEN: 'synthetic-snapshot-credential',
    MEET_UX_V2: 'true',
  };
  const options = {
    environment: 'production' as const,
    env,
    fetch,
    now: () => time,
  };
  return {
    env,
    fetch,
    createReader: () => createRemoteRuntimeReader(options),
    advance: (ms: number) => {
      time += ms;
    },
  };
}

afterEach(() => vi.useRealTimers());

describe('remote platform runtime reader', () => {
  it('shares one conditional refresh across concurrent requests every 60 seconds', async () => {
    const { createReader, fetch, advance } = setup();
    const reader = createReader();
    const burst = () =>
      Promise.all(Array.from({ length: 32 }, () => reader.evaluateFlag(key)));
    expect(
      (await burst()).every((result) => result.source === 'platform')
    ).toBe(true);
    advance(59_999);
    await burst();
    expect(fetch).toHaveBeenCalledTimes(1);
    advance(1);
    fetch.mockResolvedValue(
      new Response(null, { status: 304, headers: { ETag: etag } })
    );
    expect((await burst()).every((result) => result.enabled)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    const [url, options] = fetch.mock.calls[1]!;
    expect(String(url)).toBe(
      'https://example.test/api/v1/feature-flags/snapshot?environment=production'
    );
    expect(new Headers(options?.headers).get('If-None-Match')).toBe(etag);
    expect(options?.redirect).toBe('error');
  });

  it('allows one fresh fetch when a new isolate starts', async () => {
    const { createReader, fetch } = setup();
    await createReader().evaluateFlag(key);
    const fresh = createReader();
    const decisions = await Promise.all([
      fresh.evaluateFlag(key),
      fresh.evaluateFlag(key),
    ]);
    expect(decisions.every((decision) => decision.source === 'platform')).toBe(
      true
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(
      new Headers(fetch.mock.calls[1]?.[1]?.headers).has('If-None-Match')
    ).toBe(false);
  });

  it('aborts a timed out request and waits until the next TTL slot before retrying', async () => {
    vi.useFakeTimers();
    const { createReader, fetch, advance } = setup();
    fetch.mockImplementationOnce(() => new Promise(() => {}));
    const reader = createReader();
    const pending = reader.evaluateFlag(key);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await pending).toMatchObject({
      enabled: true,
      source: 'env-fallback',
    });
    expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);

    advance(59_999);
    await reader.evaluateFlag(key);
    expect(fetch).toHaveBeenCalledTimes(1);
    advance(1);
    expect(await reader.evaluateFlag(key)).toMatchObject({
      source: 'platform',
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('stops serving the last good snapshot at 10 minutes without reactivating a store-backed fallback', async () => {
    const { createReader, fetch, advance } = setup();
    const reader = createReader();
    await reader.evaluateFlag(key);
    fetch.mockRejectedValue(new Error('offline'));
    advance(60_000);
    expect(await reader.evaluateFlag(key)).toMatchObject({
      enabled: true,
      source: 'platform',
    });
    advance(540_000);
    expect(await reader.evaluateFlag(key)).toMatchObject({ enabled: false });
  });

  it.each([
    'FEATURE_FLAGS_REMOTE',
    'FEATURE_FLAGS_SNAPSHOT_URL',
    'FEATURE_FLAGS_SNAPSHOT_TOKEN',
  ])('skips transport when %s disables remote reads', async (name) => {
    const { createReader, fetch, env } = setup();
    env[name] = name === 'FEATURE_FLAGS_REMOTE' ? 'off' : undefined;
    const reader = createReader();
    expect(await reader.evaluateFlag(key)).toMatchObject({
      enabled: true,
      source: 'env-fallback',
    });
    expect(await reader.evaluateFlag(key, { workspaceId })).toMatchObject({
      enabled: false,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('never substitutes platform rules for a workspace decision', async () => {
    const { createReader, fetch } = setup();
    const reader = createReader();
    expect(await reader.evaluateFlag(key)).toMatchObject({
      enabled: true,
      source: 'platform',
    });
    expect(await reader.evaluateFlag(key, { workspaceId })).toMatchObject({
      enabled: false,
      trace: ['subject rules unavailable in the Worker'],
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
