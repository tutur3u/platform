// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
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
describe('real Response and single-reader release contract', () => {
  it('reentrant getReader abort accounts for the newly acquired reader before cleanup', async () => {
    const f = owner();
    const o = observer(f);
    const original = new Response('synthetic');
    const acquire = original.body!.getReader.bind(original.body!);
    const release = vi.fn();
    const cancel = vi.fn();
    vi.spyOn(original.body!, 'getReader').mockImplementation(() => {
      const reader = acquire();
      const nativeRelease = reader.releaseLock.bind(reader);
      const nativeCancel = reader.cancel.bind(reader);
      release.mockImplementation(nativeRelease);
      cancel.mockImplementation(nativeCancel);
      Object.assign(reader, { cancel, releaseLock: release });
      f.incoming.abort();
      return reader;
    });
    await expect(
      createStaffAuthTransport(f.operation, async () => original)(url)
    ).rejects.toThrow();
    expect((await f.run(async () => true)).status).toBe(503);
    await o.closed.promise;
    expect(cancel).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
    expect(original.body!.locked).toBe(false);
  });
  it('external abort during JSON ends invocation while operation stays in budget', async () => {
    const f = owner();
    const s = source();
    const external = new AbortController();
    const response = await createStaffAuthTransport(
      f.operation,
      async () => s.response
    )(url, { signal: external.signal });
    expect(s.response.body!.locked).toBe(true);
    const text = response.text();
    const failed = expect(text).rejects.toThrow(
      'feedback_staff_transport_failed'
    );
    await s.started.promise;
    external.abort('PRIVATE synthetic reason');
    await failed;
    expect(f.operation.signal.aborted).toBe(false);
    s.pending.resolve({ done: true, value: undefined });
    s.cancellation.resolve();
    expect((await f.run(async () => true)).status).toBe(200);
    expect(s.response.body!.locked).toBe(false);
    expect(s.cancel).toHaveBeenCalledOnce();
  });
  it('EOF bridge removal failure rejects the required resource and errors native JSON', async () => {
    const f = owner();
    const original = new Response('{"synthetic":true}');
    const external = new AbortController();
    const remove = vi
      .spyOn(external.signal, 'removeEventListener')
      .mockImplementation(() => {
        throw new Error('PRIVATE');
      });
    const response = await createStaffAuthTransport(
      f.operation,
      async () => original
    )(url, { signal: external.signal });
    await expect(response.json()).rejects.toThrow(
      'feedback_staff_transport_failed'
    );
    expect(original.body!.locked).toBe(false);
    expect(remove).toHaveBeenCalledOnce();
    expect((await f.run(async () => true)).status).toBe(503);
    expect(remove).toHaveBeenCalledOnce();
  });
  it('reentrant EOF release retains the cached acknowledgement and never cancels twice', async () => {
    const f = owner();
    const s = source();
    const response = await createStaffAuthTransport(
      f.operation,
      async () => s.response
    )(url);
    const releaseNative = s.release.getMockImplementation()!;
    s.release.mockImplementation(() => {
      f.incoming.abort();
      releaseNative();
    });
    const text = response.text();
    const failed = expect(text).rejects.toThrow(
      'feedback_staff_transport_failed'
    );
    await s.started.promise;
    s.pending.resolve({ done: true, value: undefined });
    await failed;
    expect((await f.run(async () => true)).status).toBe(503);
    expect(s.release).toHaveBeenCalledOnce();
    expect(s.cancel).not.toHaveBeenCalled();
  });
  it('synchronous reader.read throw is handled as an owned cleanup', async () => {
    const f = owner();
    const s = source();
    s.read.mockImplementation(() => {
      throw new Error('PRIVATE');
    });
    s.cancellation.resolve();
    const response = await createStaffAuthTransport(
      f.operation,
      async () => s.response
    )(url);
    await expect(response.text()).rejects.toThrow(
      'feedback_staff_transport_failed'
    );
    expect((await f.run(async () => true)).status).toBe(200);
    expect(s.cancel).toHaveBeenCalledOnce();
    expect(s.release).toHaveBeenCalledOnce();
  });
  it.each([200, 401, 503])(
    'native JSON/status/header parity for %s',
    async (status) => {
      for (const version of [null, 'invalid', '2024-01-01']) {
        const f = owner();
        const headers = new Headers({ 'content-type': 'application/json' });
        if (version) headers.set('x-supabase-api-version', version);
        const original = new Response('{"code":"synthetic"}', {
          status,
          statusText: 'Synthetic',
          headers,
        });
        Object.defineProperties(original, {
          url: { value: url },
          redirected: { value: true },
        });
        const result = await createStaffAuthTransport(
          f.operation,
          async () => original
        )(url);
        expect(original.body!.locked).toBe(true);
        expect(result).toBeInstanceOf(Response);
        expect(result.status).toBe(status);
        expect(result.statusText).toBe('Synthetic');
        expect(result.url).toBe(url);
        expect(result.redirected).toBe(true);
        expect(result.type).toBe(original.type);
        expect(result.headers.get('x-supabase-api-version')).toBe(version);
        expect(await result.json()).toEqual({ code: 'synthetic' });
        expect(original.body!.locked).toBe(false);
        expect((await f.run(async () => true)).status).toBe(200);
      }
    }
  );
  it('malformed JSON remains native parse rejection after EOF release', async () => {
    const f = owner();
    const original = new Response('{bad');
    const result = await createStaffAuthTransport(
      f.operation,
      async () => original
    )(url);
    await expect(result.json()).rejects.toBeInstanceOf(SyntaxError);
    expect(original.body!.locked).toBe(false);
    expect((await f.run(async () => true)).status).toBe(200);
  });
  it('raw bytes and extra text control never serialize or buffer the body', async () => {
    const f = owner();
    const bytes = new Uint8Array([0, 255, 13, 10, 65]);
    const original = new Response(bytes);
    const cancel = vi.spyOn(original.body!, 'cancel');
    const response = await createStaffAuthTransport(
      f.operation,
      async () => original
    )(url);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect((await f.run(async () => true)).status).toBe(200);
    expect(cancel).not.toHaveBeenCalled();
    const g = owner();
    const text = 'synthetic\nunchanged';
    expect(
      await (
        await createStaffAuthTransport(
          g.operation,
          async () => new Response(text)
        )(url)
      ).text()
    ).toBe(text);
    expect((await g.run(async () => true)).status).toBe(200);
  });
  it.each([200, 204])(
    'genuine null body%s stays owned with native JSON rejection',
    async (status) => {
      const f = owner();
      const o = observer(f);
      const original = new Response(null, { status });
      const result = await createStaffAuthTransport(
        f.operation,
        async () => original
      )(url);
      expect(result).toBe(original);
      expect(result.body).toBeNull();
      await expect(result.json()).rejects.toBeInstanceOf(SyntaxError);
      expect(o.assigned).toHaveBeenCalledExactlyOnceWith({
        kind: 'owned-response',
        response: original,
      });
      expect((await f.run(async () => true)).status).toBe(200);
    }
  );
  it('zero eager upstream read, one pending read, and clone refusal before tee', async () => {
    const f = owner();
    const s = source();
    const result = await createStaffAuthTransport(
      f.operation,
      async () => s.response
    )(url);
    expect(s.getReader).toHaveBeenCalledOnce();
    expect(s.read).not.toHaveBeenCalled();
    expect(() => result.clone()).toThrow(
      'feedback_staff_transport_clone_unsupported'
    );
    expect(result.body!.locked).toBe(false);
    const reader = result.body!.getReader();
    const first = reader.read();
    const second = reader.read();
    await s.started.promise;
    expect(s.read).toHaveBeenCalledOnce();
    const cancelled = reader.cancel();
    s.pending.resolve({ done: true, value: undefined });
    s.cancellation.resolve();
    await cancelled;
    await first;
    await second;
    expect(s.cancel).toHaveBeenCalledOnce();
    expect(s.release).toHaveBeenCalledOnce();
    expect((await f.run(async () => true)).status).toBe(200);
  });
  it.each(['bytes', 'reject'] as const)(
    'abort json suppresses late %s while cleanup stays pending',
    async (kind) => {
      const f = owner();
      const s = source();
      const o = observer(f);
      const result = await createStaffAuthTransport(
        f.operation,
        async () => s.response
      )(url);
      const json = result.json();
      const rejection = expect(json).rejects.toThrow(
        'feedback_staff_transport_failed'
      );
      await s.started.promise;
      f.incoming.abort();
      await rejection;
      expect((await f.run(async () => true)).status).toBe(503);
      let closed = false;
      void o.closed.promise.then(() => {
        closed = true;
      });
      s.cancellation.resolve();
      await Promise.resolve();
      expect(closed).toBe(false);
      if (kind === 'bytes')
        s.pending.resolve({
          done: false,
          value: new TextEncoder().encode('{"late":true}'),
        });
      else s.pending.reject(new Error('PRIVATE synthetic'));
      await o.closed.promise;
      expect(s.release).toHaveBeenCalledOnce();
      expect(s.read).toHaveBeenCalledOnce();
    }
  );
  it.each(['throw', 'reject', 'pending', 'release', 'reentrant'] as const)(
    'consumer cancel %s retains cached acknowledgement',
    async (kind) => {
      const f = owner();
      const barrierEntered = deferred<void>();
      const onStop = f.operation.onStop.bind(f.operation);
      vi.spyOn(f.operation, 'onStop').mockImplementation((cleanup) =>
        onStop(() => {
          barrierEntered.resolve();
          return cleanup();
        })
      );
      const s = source();
      const o = observer(f);
      if (kind === 'throw')
        s.cancel.mockImplementation(() => {
          throw new Error('PRIVATE');
        });
      if (kind === 'reject') s.cancel.mockRejectedValue(new Error('PRIVATE'));
      if (kind === 'release')
        s.release.mockImplementation(() => {
          throw new Error('PRIVATE');
        });
      if (kind === 'reentrant')
        s.cancel.mockImplementation(() => {
          f.incoming.abort();
          return s.cancellation.promise;
        });
      const result = await createStaffAuthTransport(
        f.operation,
        async () => s.response
      )(url);
      const cancel = result.body!.cancel();
      const observed = cancel.catch(() => {});
      if (kind === 'pending') {
        const run = f.run(async () => true);
        await barrierEntered.promise;
        expect(f.publish).not.toHaveBeenCalled();
        f.expire();
        expect((await run).status).toBe(503);
        let completed = false;
        void observed.then(() => {
          completed = true;
        });
        await Promise.resolve();
        expect(completed).toBe(false);
      }
      s.cancellation.resolve();
      await observed;
      expect(s.cancel).toHaveBeenCalledOnce();
      expect(s.release).toHaveBeenCalledOnce();
      expect((await f.run(async () => true)).status).toBe(
        kind === 'reentrant' ||
          kind === 'pending' ||
          kind === 'throw' ||
          kind === 'reject' ||
          kind === 'release'
          ? 503
          : 200
      );
      await o.closed.promise.catch(() => {});
    }
  );
  it('read rejection errors outward but successful cancellation may release ownership', async () => {
    const f = owner();
    const s = source();
    const result = await createStaffAuthTransport(
      f.operation,
      async () => s.response
    )(url);
    const text = result.text();
    const observed = expect(text).rejects.toThrow(
      'feedback_staff_transport_failed'
    );
    await s.started.promise;
    s.pending.reject(new Error('PRIVATE'));
    s.cancellation.resolve();
    await observed;
    expect((await f.run(async () => true)).status).toBe(200);
    expect(s.cancel).toHaveBeenCalledOnce();
    expect(s.release).toHaveBeenCalledOnce();
  });
  it.each(['enqueue', 'close'] as const)(
    'outward %s exception triggers owned cleanup without raw error text',
    async (kind) => {
      const f = owner();
      const s = source();
      const method = vi
        .spyOn(ReadableStreamDefaultController.prototype, kind)
        .mockImplementation(() => {
          throw new Error('PRIVATE');
        });
      try {
        const result = await createStaffAuthTransport(
          f.operation,
          async () => s.response
        )(url);
        const text = result.text();
        const observed = expect(text).rejects.toThrow(
          'feedback_staff_transport_failed'
        );
        await s.started.promise;
        s.pending.resolve(
          kind === 'close'
            ? { done: true, value: undefined }
            : { done: false, value: new Uint8Array([65]) }
        );
        s.cancellation.resolve();
        await observed;
        expect((await f.run(async () => true)).status).toBe(
          kind === 'close' ? 503 : 200
        );
        expect(s.release).toHaveBeenCalledOnce();
      } finally {
        method.mockRestore();
      }
    }
  );
});
