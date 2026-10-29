import { describe, expect, it, vi } from 'vitest';
import {
  APP_SWITCH_MAX_BODY_BYTES,
  type AppSwitchSample,
} from '../app-switch-rum';
import {
  type AppSwitchAdmissionState,
  type AppSwitchAdmissionStore,
  createAppSwitchAdmission,
  createAppSwitchWriteBudget,
  handleAppSwitchBeacon,
  isAppSwitchIngestEnabled,
  setAppSwitchAdmissionStopped,
} from '../app-switch-rum-ingest';

const sample: AppSwitchSample = {
  from: 'platform',
  to: 'meet',
  topology: 'subdomain',
  durationMs: 812,
  prerendered: false,
  handoff: true,
  protocol: 'h3',
  connectMs: 41,
  effectiveType: '4g',
};
const url = 'https://meet.tuturuuu.com/_rum';
const beacon = (body: unknown = sample, init: RequestInit = {}) =>
  new Request(url, {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...init,
  });
const streamed = (stream: ReadableStream<Uint8Array>) =>
  new Request(url, {
    method: 'POST',
    body: stream,
    duplex: 'half',
  } as RequestInit);

/** Durable Object stand-in: one shared state, updates applied one at a time. */
function memoryStore(initial?: AppSwitchAdmissionState) {
  let state = initial;
  let queue: Promise<unknown> = Promise.resolve();
  const control = { failing: false, updates: 0 };
  const store: AppSwitchAdmissionStore = {
    update(next) {
      const run = queue.then(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
        control.updates += 1;
        if (control.failing) throw new Error('storage unavailable');
        const { state: written, result } = next(state);
        state = written;
        return result;
      });
      queue = run.catch(() => undefined);
      return run;
    },
  };
  return { store, control, read: () => state };
}
const started = () => memoryStore({ stopped: false, windowStart: 0, used: 0 });

function instance(
  store: AppSwitchAdmissionStore,
  limit: number,
  now = () => 1_000
) {
  const budget = createAppSwitchWriteBudget(1_000);
  const admission = createAppSwitchAdmission(store, limit);
  return (dataset: { writeDataPoint: () => void }, request = beacon()) =>
    handleAppSwitchBeacon(request, dataset, {
      ingest: 'on',
      budget,
      admission,
      now,
    });
}

describe('fence and fail-closed defaults', () => {
  it('writes one data point when every gate passes', async () => {
    const writeDataPoint = vi.fn();
    const response = await instance(started().store, 5)({ writeDataPoint });
    expect(response.status).toBe(204);
    expect(writeDataPoint).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, '', 'off', 'true', '1', 'enabled'])(
    'stays stopped for fence value %j without reading the body',
    async (ingest) => {
      const writeDataPoint = vi.fn();
      const { store, control } = started();
      const request = beacon();
      const response = await handleAppSwitchBeacon(
        request,
        { writeDataPoint },
        {
          ingest,
          budget: createAppSwitchWriteBudget(),
          admission: createAppSwitchAdmission(store, 5),
        }
      );
      expect(response.status).toBe(204);
      expect(request.bodyUsed).toBe(false);
      expect(control.updates).toBe(0);
      expect(writeDataPoint).not.toHaveBeenCalled();
    }
  );

  it('accepts only the literal on, ignoring case and whitespace', () => {
    expect(isAppSwitchIngestEnabled(' ON ')).toBe(true);
    expect(isAppSwitchIngestEnabled(true)).toBe(false);
  });

  it('writes nothing without a durable admission or dataset', async () => {
    const writeDataPoint = vi.fn();
    const budget = createAppSwitchWriteBudget();
    expect(
      (
        await handleAppSwitchBeacon(
          beacon(),
          { writeDataPoint },
          { ingest: 'on', budget }
        )
      ).status
    ).toBe(204);
    expect(
      (
        await handleAppSwitchBeacon(beacon(), undefined, {
          ingest: 'on',
          budget,
          admission: createAppSwitchAdmission(started().store, 5),
        })
      ).status
    ).toBe(204);
    expect(writeDataPoint).not.toHaveBeenCalled();
  });

  it('admits nothing until an operator starts admission', async () => {
    const writeDataPoint = vi.fn();
    const { store } = memoryStore();
    const post = instance(store, 5);
    await post({ writeDataPoint });
    expect(writeDataPoint).not.toHaveBeenCalled();
    await setAppSwitchAdmissionStopped(store, false);
    await post({ writeDataPoint });
    expect(writeDataPoint).toHaveBeenCalledTimes(1);
  });
});

describe('durable budget and stop', () => {
  it('never exceeds the shared budget across concurrent instances', async () => {
    const writeDataPoint = vi.fn();
    const { store } = started();
    let now = 1_000;
    const instances = Array.from({ length: 5 }, () =>
      instance(store, 7, () => now)
    );
    await Promise.all(
      Array.from({ length: 60 }, (_, index) =>
        instances[index % instances.length]!({ writeDataPoint })
      )
    );
    expect(writeDataPoint).toHaveBeenCalledTimes(7);
    now += 60_000;
    await Promise.all(
      Array.from({ length: 60 }, (_, index) =>
        instances[index % instances.length]!({ writeDataPoint })
      )
    );
    expect(writeDataPoint).toHaveBeenCalledTimes(14);
  });

  it('limits durable admission calls with the isolate pre-filter', async () => {
    const writeDataPoint = vi.fn();
    const { store, control } = started();
    const options = {
      ingest: 'on',
      budget: createAppSwitchWriteBudget(10),
      admission: createAppSwitchAdmission(store, 1_000),
      now: () => 1_000,
    };
    for (let index = 0; index < 100; index++)
      await handleAppSwitchBeacon(beacon(), { writeDataPoint }, options);
    expect(control.updates).toBe(10);
    expect(writeDataPoint).toHaveBeenCalledTimes(10);
  });

  it('holds an operator stop after instances are recreated', async () => {
    const writeDataPoint = vi.fn();
    const { store } = started();
    await instance(store, 50)({ writeDataPoint });
    expect(writeDataPoint).toHaveBeenCalledTimes(1);
    await setAppSwitchAdmissionStopped(store, true);
    for (const post of [instance(store, 50), instance(store, 50)])
      await Promise.all(
        Array.from({ length: 20 }, () => post({ writeDataPoint }))
      );
    expect(writeDataPoint).toHaveBeenCalledTimes(1);
    // Resuming admits only beacons that arrive afterwards: nothing was queued.
    await setAppSwitchAdmissionStopped(store, false);
    await instance(store, 50)({ writeDataPoint });
    expect(writeDataPoint).toHaveBeenCalledTimes(2);
  });

  it('writes nothing while admission storage fails, then recovers', async () => {
    const writeDataPoint = vi.fn();
    const { store, control } = started();
    control.failing = true;
    for (const post of [instance(store, 50), instance(store, 50)])
      expect((await post({ writeDataPoint })).status).toBe(204);
    expect(writeDataPoint).not.toHaveBeenCalled();
    control.failing = false;
    await instance(store, 50)({ writeDataPoint });
    expect(writeDataPoint).toHaveBeenCalledTimes(1);
  });

  it('drops a failed write without retrying', async () => {
    const writeDataPoint = vi.fn(() => {
      throw new Error('dataset unavailable');
    });
    expect(
      (await instance(started().store, 5)({ writeDataPoint })).status
    ).toBe(204);
    expect(writeDataPoint).toHaveBeenCalledTimes(1);
  });
});

describe('bounded body', () => {
  const post = (request: Request, readTimeoutMs?: number) => {
    const writeDataPoint = vi.fn();
    return handleAppSwitchBeacon(
      request,
      { writeDataPoint },
      {
        ingest: 'on',
        budget: createAppSwitchWriteBudget(),
        admission: createAppSwitchAdmission(started().store, 5),
        readTimeoutMs,
      }
    ).then((response) => ({ response, writeDataPoint }));
  };

  it('stops a chunked body over the byte limit without draining it', async () => {
    let pulls = 0;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(256).fill(32));
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = streamed(stream);
    expect(request.headers.get('content-length')).toBeNull();
    const { response, writeDataPoint } = await post(request);
    expect(response.status).toBe(413);
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThanOrEqual(7);
    expect(writeDataPoint).not.toHaveBeenCalled();
  });

  it('counts bytes, not UTF-16 code units', async () => {
    const body = JSON.stringify({ ...sample, protocol: 'é'.repeat(600) });
    expect(body.length).toBeLessThan(APP_SWITCH_MAX_BODY_BYTES);
    expect(new TextEncoder().encode(body).byteLength).toBeGreaterThan(
      APP_SWITCH_MAX_BODY_BYTES
    );
    const encoded = new TextEncoder().encode(body);
    const { response } = await post(
      streamed(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoded);
            controller.close();
          },
        })
      )
    );
    expect(response.status).toBe(413);
    expect((await post(beacon(body))).response.status).toBe(413);
  });

  it('refuses an oversized declared length without reading', async () => {
    const request = beacon(sample, {
      headers: { 'content-length': String(APP_SWITCH_MAX_BODY_BYTES + 1) },
    });
    expect((await post(request)).response.status).toBe(413);
    expect(request.bodyUsed).toBe(false);
  });

  it('gives up on a body that never arrives', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    const { response } = await post(streamed(stream), 20);
    expect(response.status).toBe(408);
    expect(cancelled).toBe(true);
  });

  it('rejects invalid UTF-8, JSON and samples, and other methods', async () => {
    const invalid = new Uint8Array([0x7b, 0xff, 0x7d]);
    const utf8 = streamed(
      new ReadableStream({
        start(controller) {
          controller.enqueue(invalid);
          controller.close();
        },
      })
    );
    expect((await post(utf8)).response.status).toBe(400);
    expect((await post(beacon('{'))).response.status).toBe(400);
    expect((await post(beacon({ ...sample, to: 'x y' }))).response.status).toBe(
      400
    );
    expect((await post(new Request(url))).response.status).toBe(405);
  });
});
