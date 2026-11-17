import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as capture } from '../capture/route';
import { POST as lookup } from './route';

const spies = vi.hoisted(() => ({
  store: vi.fn(),
  rpc: vi.fn(),
  lookup: vi.fn(),
  capture: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/cite/runtime-db', () => ({
  getCitationRuntimeDb: spies.store,
}));
vi.mock('@/lib/cite/metadata', () => ({ lookupCitation: spies.lookup }));
vi.mock('@/lib/cite/capture', () => ({ captureCitation: spies.capture }));
const syntheticOriginSecret = 'synthetic-citation-origin-proof-fixture-only';
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('TRUSTED_PROXY', 'cloudflare-origin');
  vi.stubEnv('TRUSTED_PROXY_ORIGIN_SECRET', syntheticOriginSecret);
  spies.store.mockResolvedValue({ rpc: spies.rpc });
  spies.rpc.mockResolvedValue({ data: true, error: null });
  spies.lookup.mockResolvedValue({ fields: { title: 'Synthetic source' } });
  spies.capture.mockResolvedValue({ kind: 'manual', fields: { title: '' } });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function request(proof?: string) {
  const headers = new Headers({
    'content-type': 'application/json',
    'cf-connecting-ip': '198.51.100.1',
    'x-forwarded-for': '198.51.100.2',
  });
  if (proof) headers.set('x-tuturuuu-origin-auth', proof);
  return new Request('https://tuturuuu.com/api/v1/cite/lookup', {
    method: 'POST',
    headers,
    body: JSON.stringify({ input: '10.5555/synthetic' }),
  });
}

describe.each([
  ['lookup', lookup],
  ['capture', capture],
] as const)('%s authenticated origin admission', (_name, handler) => {
  it('rejects a spoofed CF header without proof before the budget RPC or source/cache access', async () => {
    expect((await handler(request())).status).toBe(429);
    expect(spies.store).not.toHaveBeenCalled();
    expect(spies.lookup).not.toHaveBeenCalled();
    expect(spies.capture).not.toHaveBeenCalled();
  });

  it('admits the existing trusted origin proof before one budget claim', async () => {
    const incoming = request(syntheticOriginSecret);
    expect((await handler(incoming)).status).toBe(200);
    expect(spies.rpc).toHaveBeenCalledTimes(1);
    expect(
      spies.lookup.mock.calls.length + spies.capture.mock.calls.length
    ).toBe(1);
    if (_name === 'lookup')
      expect(spies.lookup).toHaveBeenCalledWith(
        '10.5555/synthetic',
        undefined,
        incoming.signal
      );
    else
      expect(spies.capture).toHaveBeenCalledWith('10.5555/synthetic', {
        signal: incoming.signal,
      });
  });

  it('cancels a slow request body on caller abort before starting source work', async () => {
    const controller = new AbortController();
    const reading = Promise.withResolvers<void>();
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>(
      {
        pull: () => {
          reading.resolve();
        },
        cancel,
      },
      { highWaterMark: 0 }
    );
    const init = Object.assign(
      {
        method: 'POST',
        headers: request(syntheticOriginSecret).headers,
        body,
        signal: controller.signal,
      },
      { duplex: 'half' }
    );
    const pending = handler(
      new Request('https://tuturuuu.com/api/v1/cite/lookup', init)
    );
    await reading.promise;
    controller.abort();
    expect((await pending).status).toBe(504);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(spies.lookup).not.toHaveBeenCalled();
    expect(spies.capture).not.toHaveBeenCalled();
  });

  it('expires a 4 KiB request body after 2 seconds before starting source work', async () => {
    vi.useFakeTimers();
    const timeout = vi
      .spyOn(AbortSignal, 'timeout')
      .mockImplementation((milliseconds) => {
        const controller = new AbortController();
        setTimeout(
          () => controller.abort(new DOMException('Timed out', 'TimeoutError')),
          milliseconds
        );
        return controller.signal;
      });
    const body = new ReadableStream<Uint8Array>({}, { highWaterMark: 0 });
    const init = Object.assign(
      { method: 'POST', headers: request(syntheticOriginSecret).headers, body },
      { duplex: 'half' }
    );
    const pending = handler(
      new Request('https://tuturuuu.com/api/v1/cite/lookup', init)
    );
    await vi.advanceTimersByTimeAsync(2000);
    expect((await pending).status).toBe(504);
    expect(timeout).toHaveBeenCalledWith(2000);
    expect(spies.lookup).not.toHaveBeenCalled();
    expect(spies.capture).not.toHaveBeenCalled();
  });

  it('returns 503 on missing storage even with a trusted proof', async () => {
    spies.store.mockResolvedValue(null);
    expect((await handler(request(syntheticOriginSecret))).status).toBe(503);
    expect(spies.lookup).not.toHaveBeenCalled();
    expect(spies.capture).not.toHaveBeenCalled();
  });
});
