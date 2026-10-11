// @vitest-environment node
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { describe, expect, it, vi } from 'vitest';
import { StaffReadError } from './staff-access';
import { createStaffAuthTransport } from './staff-auth-transport';
import {
  openStaffOperation,
  type StaffOperationContext,
} from './staff-operation';

const url = 'https://synthetic.invalid/auth/v1/user';
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function owner() {
  let time = 0;
  let wake = () => {};
  const incoming = new AbortController();
  const operation = openStaffOperation(
    new Request(url, { signal: incoming.signal }),
    {
      durationMs: 10,
      scope: 'staff-list-detail-handler',
      provenance: 'synthetic test only',
    },
    {
      now: () => time,
      schedule: (callback) => {
        wake = callback;
        return () => {};
      },
    }
  );
  if (!operation) throw new Error('synthetic owner missing');
  const publish = vi.fn(() => Response.json({ safe: true }));
  const failure = (status: number) =>
    Response.json({ error: 'safe' }, { status });
  return {
    operation,
    incoming,
    publish,
    expire: () => {
      time = 10;
      wake();
    },
    run: (callback: (context: StaffOperationContext) => Promise<unknown>) =>
      operation.run(operation.phase(callback), publish, failure),
  };
}
function observer(f: ReturnType<typeof owner>) {
  const original = f.operation.resource.bind(f.operation);
  const assigned = vi.fn();
  const closed = deferred<void>();
  vi.spyOn(f.operation, 'resource').mockImplementation(
    <T>(close: (value: T) => void | Promise<void>) => {
      const assign = original<T>(async (value) => {
        try {
          await close(value);
          closed.resolve();
        } catch (error) {
          closed.reject(error);
          throw error;
        }
      });
      return (value: T) => {
        assigned(value);
        assign(value);
      };
    }
  );
  void closed.promise.catch(() => {});
  return { assigned, closed };
}
function source() {
  const pending = deferred<ReadableStreamReadResult<Uint8Array>>();
  const started = deferred<void>();
  const cancellation = deferred<void>();
  const read = vi.fn(() => {
    started.resolve();
    return pending.promise;
  });
  const cancel = vi.fn(() => cancellation.promise);
  let releaseNative = () => {};
  const release = vi.fn(() => releaseNative());
  const body = new ReadableStream<Uint8Array>({}, { highWaterMark: 0 });
  const acquire = body.getReader.bind(body);
  const getReader = vi.spyOn(body, 'getReader').mockImplementation(() => {
    const reader = acquire();
    releaseNative = reader.releaseLock.bind(reader);
    return Object.assign(reader, { read, cancel, releaseLock: release });
  });
  const response = new Response(body);
  return {
    pending,
    started,
    cancellation,
    read,
    cancel,
    release,
    response,
    getReader,
  };
}
const syntheticUser = { id: '91800000-0000-4000-8000-000000000001' };

describe('allocation, signals and selected fetch argument contract', () => {
  it('post-registration operation checkpoint settles prevention before throwing', async () => {
    const f = owner();
    const o = observer(f);
    const original = f.operation.check;
    vi.spyOn(f.operation, 'check')
      .mockImplementationOnce(original)
      .mockImplementationOnce(() => {
        f.incoming.abort();
        original();
      });
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      createStaffAuthTransport(f.operation, fetcher)(url)
    ).rejects.toThrow();
    expect(o.assigned).toHaveBeenCalledExactlyOnceWith({ kind: 'no-response' });
    expect(fetcher).not.toHaveBeenCalled();
    expect((await f.run(async () => true)).status).toBe(503);
    await o.closed.promise;
  });
  it('initial check creates no allocation and dispatches nothing', () => {
    const f = owner();
    const assigned = observer(f);
    const fetcher = vi.fn<typeof fetch>();
    f.incoming.abort();
    expect(() => createStaffAuthTransport(f.operation, fetcher)(url)).toThrow();
    expect(assigned.assigned).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(['sync', 'reject', 'prevent'] as const)(
    'F1 %s settles before throwing checkpoint',
    async (kind) => {
      const f = owner();
      const o = observer(f);
      const external = new AbortController();
      if (kind === 'prevent') external.abort();
      const fetcher = vi.fn<typeof fetch>(() => {
        f.incoming.abort();
        if (kind === 'sync') throw new Error('synthetic');
        return Promise.reject(new Error('synthetic'));
      });
      await expect(
        createStaffAuthTransport(f.operation, fetcher)(url, {
          signal: external.signal,
        })
      ).rejects.toThrow();
      expect(o.assigned).toHaveBeenCalledExactlyOnceWith({
        kind: 'no-response',
      });
      if (kind === 'prevent') expect(fetcher).not.toHaveBeenCalled();
      expect((await f.run(async () => true)).status).toBe(
        kind === 'prevent' ? 200 : 503
      );
      await o.closed.promise;
    }
  );
  it.each(['fulfill', 'reject'] as const)(
    'pending dispatch stays unassigned through503 then late %s',
    async (kind) => {
      const f = owner();
      const o = observer(f);
      const pending = deferred<Response>();
      const started = deferred<void>();
      const fetcher = vi.fn<typeof fetch>(() => {
        started.resolve();
        return pending.promise;
      });
      const result = f.run(async () =>
        createStaffAuthTransport(f.operation, fetcher)(url)
      );
      await started.promise;
      f.incoming.abort();
      expect((await result).status).toBe(503);
      expect(o.assigned).not.toHaveBeenCalled();
      const response = new Response('late');
      if (kind === 'fulfill') pending.resolve(response);
      else pending.reject(new Error('synthetic'));
      await o.closed.promise;
      expect(o.assigned).toHaveBeenCalledOnce();
      expect(o.assigned.mock.calls[0]![0].kind).toBe(
        kind === 'fulfill' ? 'owned-response' : 'no-response'
      );
      if (kind === 'fulfill') expect(response.bodyUsed).toBe(true);
    }
  );
  it.each(['omitted', 'undefined', 'null', 'replacement'] as const)(
    'Request signal semantics %s preserve input and bytes',
    async (kind) => {
      const f = owner();
      const requestAbort = new AbortController();
      requestAbort.abort();
      const request = new Request(url, { signal: requestAbort.signal });
      const replacement = new AbortController();
      const bytes = new Uint8Array([0, 255, 2]);
      const headers = new Headers({ 'x-synthetic': 'same' });
      const init: RequestInit & { duplex: string } = {
        method: 'POST',
        headers,
        body: bytes,
        duplex: 'half',
        credentials: 'omit',
      };
      if (kind === 'undefined') init.signal = undefined;
      if (kind === 'null') init.signal = null;
      if (kind === 'replacement') init.signal = replacement.signal;
      const fetcher = vi.fn<typeof fetch>(
        async () => new Response(null, { status: 204 })
      );
      const transport = createStaffAuthTransport(f.operation, fetcher);
      if (kind === 'omitted' || kind === 'undefined') {
        await expect(transport(request, init)).rejects.toThrow();
        expect(fetcher).not.toHaveBeenCalled();
      } else {
        expect((await transport(request, init)).status).toBe(204);
        expect(fetcher.mock.calls[0]![0]).toBe(request);
        expect(fetcher.mock.calls[0]![1]).toMatchObject({
          method: 'POST',
          headers,
          body: bytes,
          duplex: 'half',
          credentials: 'omit',
        });
        expect(fetcher.mock.calls[0]![1]!.body).toBe(bytes);
        expect(fetcher.mock.calls[0]![1]!.signal).not.toBe(replacement.signal);
      }
      expect((await f.run(async () => true)).status).toBe(200);
    }
  );
  it('null external signal cannot detach operation abort and URL/plain-init preserves options', async () => {
    const f = owner();
    const started = deferred<void>();
    const pending = deferred<Response>();
    let selected: AbortSignal | null | undefined;
    const fetcher = vi.fn<typeof fetch>((input, init) => {
      expect(input).toBe(url);
      expect(init).toMatchObject({
        cache: 'no-store',
        redirect: 'manual',
        keepalive: true,
        signal: expect.any(AbortSignal),
      });
      selected = init?.signal;
      started.resolve();
      return pending.promise;
    });
    const result = createStaffAuthTransport(f.operation, fetcher)(url, {
      signal: null,
      cache: 'no-store',
      redirect: 'manual',
      keepalive: true,
    });
    await started.promise;
    f.incoming.abort();
    expect(selected?.aborted).toBe(true);
    pending.reject(new Error('synthetic'));
    await expect(result).rejects.toThrow();
    expect((await f.run(async () => true)).status).toBe(503);
  });
  it.each(['install', 'race', 'remove'] as const)(
    'listener %s failure remains an actual owner obligation',
    async (kind) => {
      const f = owner();
      const external = new AbortController();
      const add = external.signal.addEventListener.bind(external.signal);
      const remove = vi.spyOn(f.operation.signal, 'removeEventListener');
      if (kind === 'remove')
        remove.mockImplementation(() => {
          throw new Error('synthetic');
        });
      else
        vi.spyOn(external.signal, 'addEventListener').mockImplementation(
          (...args) => {
            if (kind === 'install') throw new Error('synthetic');
            add(...args);
            external.abort();
          }
        );
      const fetcher = vi.fn<typeof fetch>(
        async () => new Response(null, { status: 204 })
      );
      await expect(
        createStaffAuthTransport(f.operation, fetcher)(url, {
          signal: external.signal,
        })
      ).rejects.toThrow();
      if (kind !== 'remove') expect(fetcher).not.toHaveBeenCalled();
      expect(remove).toHaveBeenCalledOnce();
      expect((await f.run(async () => true)).status).toBe(
        kind === 'remove' ? 503 : 200
      );
    }
  );
  it.each(['body', 'status', 'getReader', 'constructor'] as const)(
    'owned response precedes throwing %s inspection',
    async (kind) => {
      const f = owner();
      const o = observer(f);
      const response = new Response('synthetic');
      const cancel = vi.spyOn(response.body!, 'cancel');
      if (kind === 'body')
        Object.defineProperty(response, 'body', {
          get: () => {
            throw new Error('synthetic');
          },
        });
      if (kind === 'status')
        Object.defineProperty(response, 'status', {
          get: () => {
            throw new Error('synthetic');
          },
        });
      if (kind === 'getReader')
        vi.spyOn(response.body!, 'getReader').mockImplementation(() => {
          throw new Error('synthetic');
        });
      if (kind === 'constructor')
        Object.defineProperty(response, 'status', { value: 101 });
      await expect(
        createStaffAuthTransport(f.operation, async () => response)(url)
      ).rejects.toThrow();
      expect(o.assigned).toHaveBeenCalledExactlyOnceWith({
        kind: 'owned-response',
        response,
      });
      const result = await f.run(async () => true);
      expect(result.status).toBe(kind === 'body' ? 503 : 200);
      if (kind !== 'body') expect(response.body!.locked).toBe(false);
      if (kind === 'getReader') expect(cancel).toHaveBeenCalledOnce();
    }
  );
  it.each(['locked', 'disturbed', 'opaque'] as const)(
    '%s cannot fabricate a no-response success',
    async (kind) => {
      const f = owner();
      const o = observer(f);
      const response = new Response('synthetic');
      let foreign: ReadableStreamDefaultReader<Uint8Array> | undefined;
      if (kind === 'locked') foreign = response.body!.getReader();
      if (kind === 'disturbed') await response.text();
      if (kind === 'opaque')
        Object.defineProperty(response, 'status', { value: 0 });
      await expect(
        createStaffAuthTransport(f.operation, async () => response)(url)
      ).rejects.toThrow();
      expect((await f.run(async () => true)).status).toBe(503);
      expect(o.assigned.mock.calls[0]![0].kind).toBe('owned-response');
      foreign?.releaseLock();
    }
  );
});

describe('F1 actual StaffOperation.run barrier, synthetic Auth composition only', () => {
  it.each([
    ['fulfill', false],
    ['reject', false],
    ['fulfill', true],
    ['reject', true],
  ] as const)(
    'R1 reentrant read %s retains ownership through cutoff=%s',
    async (kind, cutoff) => {
      const f = owner();
      const entered = deferred<void>();
      const acknowledged = vi.fn();
      const onStop = f.operation.onStop.bind(f.operation);
      vi.spyOn(f.operation, 'onStop').mockImplementation((cleanup) =>
        onStop(async () => {
          entered.resolve();
          await cleanup();
          acknowledged();
        })
      );
      const o = observer(f);
      const closed = vi.fn();
      void o.closed.promise.then(closed);
      const s = source();
      const external = new AbortController();
      s.read.mockImplementation(() => {
        external.abort();
        s.started.resolve();
        return s.pending.promise;
      });
      // Cancel acknowledges independently of the instrumented real reader's read.
      s.cancellation.resolve();
      const consumedFailure = vi.fn();
      const run = f.run(async (context) => {
        const response = await createStaffAuthTransport(
          context,
          async () => s.response
        )(url, { signal: external.signal });
        try {
          await response.text();
        } catch (error) {
          expect(error).toBeInstanceOf(TypeError);
          expect((error as Error).message).toBe(
            'feedback_staff_transport_failed'
          );
          consumedFailure();
        }
        return true; // Synthetic permitted fallback still passes through the real barrier.
      });
      await s.started.promise;
      await entered.promise;
      // Drain the independent cancellation's continuations without a duration timer.
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(consumedFailure).toHaveBeenCalledOnce();
      expect(f.operation.signal.aborted).toBe(false);
      expect(s.cancel).toHaveBeenCalledOnce();
      expect(s.read).toHaveBeenCalledOnce();
      expect(s.release).not.toHaveBeenCalled();
      expect(s.response.body!.locked).toBe(true);
      expect(closed).not.toHaveBeenCalled();
      expect(acknowledged).not.toHaveBeenCalled();
      expect(f.publish).not.toHaveBeenCalled();
      if (cutoff) {
        f.expire();
        expect((await run).status).toBe(503);
        expect(f.publish).not.toHaveBeenCalled();
        expect(s.release).not.toHaveBeenCalled();
        expect(closed).not.toHaveBeenCalled();
        expect(acknowledged).not.toHaveBeenCalled();
        expect(s.response.body!.locked).toBe(true);
      }
      if (kind === 'fulfill')
        s.pending.resolve({ done: false, value: new Uint8Array([65]) });
      else s.pending.reject(new Error('PRIVATE synthetic read rejection'));
      await o.closed.promise;
      expect((await run).status).toBe(cutoff ? 503 : 200);
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(closed).toHaveBeenCalledOnce();
      expect(acknowledged).toHaveBeenCalledOnce();
      expect(s.cancel).toHaveBeenCalledOnce();
      expect(s.release).toHaveBeenCalledOnce();
      expect(s.response.body!.locked).toBe(false);
      expect(s.read).toHaveBeenCalledOnce();
      expect(f.publish).toHaveBeenCalledTimes(cutoff ? 0 : 1);
    }
  );
  it('rejected optional claims then authoritative native JSON completes200 before cutoff', async () => {
    const f = owner();
    const dispatch = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error('synthetic claims transport failure'))
      .mockResolvedValueOnce(Response.json({ user: syntheticUser }));
    const transport = createStaffAuthTransport(f.operation, dispatch);
    // Structural SDK-shaped fixture, not installed SDK or live GoTrue evidence.
    const client = {
      auth: {
        getClaims: async () => {
          await transport('https://synthetic.invalid/jwks');
          return { data: null, error: null };
        },
        getUser: async () => ({
          data: await (await transport(url)).json(),
          error: null,
        }),
      },
    };
    const result = await f.run(async (context) => {
      const resolved = await resolveAuthenticatedSessionUser(client as never, {
        check: context.check,
      });
      expect(resolved.user).toEqual(syntheticUser);
      return true;
    });
    expect(result.status).toBe(200);
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(f.publish).toHaveBeenCalledOnce();
    expect(client.auth.getUser).toHaveLength(0);
  });
  it.each([401, 403] as const)(
    'definitive no-response keeps in-budget denial%s at actual barrier',
    async (status) => {
      const f = owner();
      const transport = createStaffAuthTransport(f.operation, () =>
        Promise.reject(new Error('synthetic'))
      );
      const result = await f.run(async () => {
        try {
          await transport(url);
        } catch {
          throw new StaffReadError(status);
        }
      });
      expect(result.status).toBe(status);
      expect(f.publish).not.toHaveBeenCalled();
    }
  );
  it.each(['prevent', 'sync'] as const)(
    'recoverable %s no-response allows actual barrier200',
    async (kind) => {
      const f = owner();
      const external = new AbortController();
      external.abort();
      const transport = createStaffAuthTransport(f.operation, () => {
        throw new Error('synthetic');
      });
      const result = await f.run(async () => {
        try {
          await transport(
            url,
            kind === 'prevent' ? { signal: external.signal } : undefined
          );
        } catch {
          /* synthetic permitted fallback */
        }
        return true;
      });
      expect(result.status).toBe(200);
    }
  );
  it('failed cleanup prevents publication even when callback catches consumption failure', async () => {
    const f = owner();
    const s = source();
    s.release.mockImplementation(() => {
      throw new Error('PRIVATE');
    });
    const result = f.run(async () => {
      const response = await createStaffAuthTransport(
        f.operation,
        async () => s.response
      )(url);
      const text = response.text().catch(() => {});
      await s.started.promise;
      s.pending.resolve({ done: true, value: undefined });
      await text;
      return true;
    });
    expect((await result).status).toBe(503);
    expect(f.publish).not.toHaveBeenCalled();
  });
  it('causal omitted-assignment control reaches503 at injected cutoff, restored transport200', async () => {
    const f = owner();
    const reached = deferred<void>();
    const allocation = deferred<void>();
    const onStop = f.operation.onStop.bind(f.operation);
    vi.spyOn(f.operation, 'onStop').mockImplementation((cleanup) =>
      onStop(() => {
        reached.resolve();
        return cleanup();
      })
    );
    const broken = f.run(async (context) => {
      const assign = context.resource<void>(() => {});
      void allocation.promise.then(() => assign());
      return true;
    });
    await reached.promise;
    f.expire();
    expect((await broken).status).toBe(503);
    allocation.resolve();
    const restored = owner();
    const result = await restored.run(async () => {
      try {
        await createStaffAuthTransport(restored.operation, () =>
          Promise.reject(new Error('synthetic'))
        )(url);
      } catch {
        /* fallback */
      }
      return true;
    });
    expect(result.status).toBe(200);
  });
});
