import { describe, expect, it, vi, afterEach } from 'vite-plus/test';
import { bootstrapControl, controlColo } from './control-bootstrap';
import { controlStub, type FenceEnv } from './fence';
import { elapsed, newTiming, recordRpc, serverTiming } from './metrics';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('control placement', () => {
  function env(flag?: 'v1' | 'v2', hint?: string) {
    const get = vi.fn();
    return {
      get,
      env: {
        GUARD_CONTROL: { get, idFromName: (name: string) => name },
        ABUSE_GUARD_CONTROL_ID: flag,
        ABUSE_GUARD_LOCATION_HINT: hint,
      } as unknown as FenceEnv,
    };
  }
  it('defaults to intact unhinted v1', () => {
    const fixture = env();
    controlStub(fixture.env);
    expect(fixture.get).toHaveBeenCalledExactlyOnceWith('control:v1');
  });
  it.each([undefined, 'apac', 'weur', 'enam'])('hints v2 with %s', (hint) => {
    const fixture = env('v2', hint);
    controlStub(fixture.env);
    expect(fixture.get).toHaveBeenCalledExactlyOnceWith('control:v2', {
      locationHint: hint ?? 'apac',
    });
  });
  it('omits invalid location hints', () => {
    const fixture = env('v2', 'invalid');
    controlStub(fixture.env);
    expect(fixture.get).toHaveBeenCalledExactlyOnceWith('control:v2');
  });
  it('rejects invalid version flags', () => {
    const fixture = env('typo' as 'v2');
    expect(() => controlStub(fixture.env)).toThrow();
    expect(fixture.get).not.toHaveBeenCalled();
  });
});

describe('v2 first-use stop inheritance', () => {
  it.each([
    [{ stopped: false, families: {} }, false],
    [{ stopped: true, families: {} }, true],
    [{ stopped: false, families: { proxy: { stopped: true } } }, true],
    [null, true],
    [{ stopped: false }, true],
    [{ stopped: 'false', families: {} }, true],
  ])('fails closed for %j', async (source, stopped) => {
    const read = vi.fn(async () => source);
    const state = await bootstrapControl(read);
    expect(state.stopped).toBe(stopped);
    expect(state.families).toEqual({});
    expect(read).toHaveBeenCalledTimes(1);
  });
  it('persists a stop on unreadable v1 without retries', async () => {
    const read = vi.fn(async () => {
      throw new Error('unavailable');
    });
    expect((await bootstrapControl(read)).stopped).toBe(true);
    expect(read).toHaveBeenCalledTimes(1);
  });
  it('bounds a hung v1 read', async () => {
    vi.useFakeTimers();
    const pending = bootstrapControl(() => new Promise(() => {}));
    await vi.advanceTimersByTimeAsync(1000);
    expect((await pending).stopped).toBe(true);
  });
});

it('extracts only the trace colo and fails closed on trace failures', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () => new Response('ip=private\ncolo=SIN\nsecret=private\n')
  );
  vi.stubGlobal('fetch', fetch);
  expect(await controlColo()).toBe('SIN');
  expect(fetch.mock.calls[0]?.[0]).toBe(
    'https://www.cloudflare.com/cdn-cgi/trace'
  );
  fetch.mockImplementationOnce(
    async () =>
      new Response(null, {
        status: 302,
        headers: { location: 'https://other.invalid' },
      })
  );
  expect(await controlColo()).toBeNull();
  expect(fetch.mock.calls[0]?.[1]?.redirect).toBe('manual');
  fetch.mockImplementation(async () => {
    throw new Error('offline');
  });
  expect(await controlColo()).toBeNull();
});

it('emits only integer durations and fixed datapoint fields', () => {
  const timing = {
    ...newTiming(),
    family: 'proxy' as const,
    admitMs: 12,
    subjectMs: 34,
  };
  expect(serverTiming(timing)).toBe('admit;dur=12, subject;dur=34');
  const writeDataPoint = vi.fn();
  recordRpc(
    { writeDataPoint } as unknown as AnalyticsEngineDataset,
    timing,
    'ok',
    60
  );
  expect(writeDataPoint).toHaveBeenCalledExactlyOnceWith({
    blobs: ['proxy', 'ok'],
    doubles: [12, 34, 60],
  });
  expect(() => recordRpc(undefined, timing, 'ok', 60)).not.toThrow();
  writeDataPoint.mockImplementation(() => {
    throw new Error('unavailable');
  });
  expect(() =>
    recordRpc(
      { writeDataPoint } as unknown as AnalyticsEngineDataset,
      timing,
      'ok',
      60
    )
  ).not.toThrow();
  expect(Number.isInteger(elapsed(performance.now() - 1.5))).toBe(true);
});
