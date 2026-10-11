import { afterEach, expect, it, vi } from 'vitest';
import { createMeetRoomSnapshot } from './room';
import { closeBudgetPublications } from './room-provider-cleanup';
import { CloudflareSfuClient } from './sfu';

afterEach(() => vi.useRealTimers());

const client = (fetchImpl: typeof fetch) =>
  new CloudflareSfuClient({
    apiBaseUrl: 'https://provider.invalid/v1',
    appId: 'fixture-app',
    appSecret: 'fixture-secret',
    fetch: fetchImpl,
  });
const publication = {
  sessionId: 'one',
  userId: 'host',
  trackName: 'audio',
  mid: '0',
};
const pending = () => ({
  ...createMeetRoomSnapshot(),
  budget: {
    expiresAt: 1,
    accountedAt: 1,
    participantMilliseconds: 0,
    maxPublishers: 8,
    maxViewers: 96,
    pendingPublications: [publication, { ...publication, sessionId: 'two' }],
  },
});

it('a stalled fetch has no local deadline or automatic retry', async () => {
  vi.useFakeTimers();
  let resolve!: (response: Response) => void;
  const fetchImpl = vi.fn(
    (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Promise<Response>((done) => {
        resolve = done;
      })
  );
  let settled = false;
  const result = client(fetchImpl)
    .getSession('one')
    .then((value) => {
      settled = true;
      return value;
    });
  await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
  expect(settled).toBe(false);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(fetchImpl.mock.calls[0]?.[1]?.signal).toBeUndefined();
  resolve(Response.json({ tracks: [] }));
  await expect(result).resolves.toEqual({ tracks: [] });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

it.each([200, 503])(
  'a stalled %i response body retains the request beyond an hour without retries',
  async (status) => {
    vi.useFakeTimers();
    let source!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        source = controller;
      },
    });
    const fetchImpl = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        new Response(stream, { status })
    );
    let settled = false;
    const result = client(fetchImpl)
      .getSession('one')
      .then(
        (value) => {
          settled = true;
          return value;
        },
        (error: unknown) => {
          settled = true;
          return error;
        }
      );
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(settled).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[1]?.signal).toBeUndefined();
    source.enqueue(new TextEncoder().encode('{"tracks":[]}'));
    source.close();
    if (status === 200) expect(await result).toEqual({ tracks: [] });
    else expect(await result).toBeInstanceOf(Error);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  }
);

it('truncates the displayed error only after consuming the complete provider body', async () => {
  let chunks = 0;
  let bytes = 0;
  const chunk = new Uint8Array(4096).fill(120);
  const response = new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        if (chunks === 256) {
          controller.close();
          return;
        }
        chunks++;
        bytes += chunk.byteLength;
        controller.enqueue(chunk);
      },
    }),
    { status: 503 }
  );
  const fetchImpl = vi.fn(async () => response);
  await expect(client(fetchImpl).getSession('one')).rejects.toThrow(
    `cloudflare_sfu_request_failed:503 ${'x'.repeat(300)}`
  );
  expect(chunks).toBe(256);
  expect(bytes).toBe(1024 * 1024);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

it('counts repeated downstream failures across reconstruction without dropping obligations', async () => {
  const fetchImpl = vi.fn(
    async (_url: RequestInfo | URL, init?: RequestInit) =>
      init?.method === 'PUT'
        ? Response.json({ errorCode: 'temporary' }, { status: 503 })
        : Response.json({
            tracks: [{ location: 'local', trackName: 'audio', mid: '0' }],
          })
  );
  const persist = vi.fn();
  for (let restart = 0; restart < 24; restart++) {
    const provider = client(fetchImpl);
    const state = pending();
    await expect(
      closeBudgetPublications(
        state,
        (input) => provider.closeTracks(input),
        persist,
        (id) => provider.getSession(id)
      )
    ).rejects.toThrow();
    expect(state.budget.pendingPublications).toHaveLength(2);
  }
  expect(
    fetchImpl.mock.calls.filter(([, init]) => init?.method === 'PUT')
  ).toHaveLength(48);
  expect(
    fetchImpl.mock.calls.filter(([, init]) => init?.method === 'GET')
  ).toHaveLength(48);
  expect(persist).not.toHaveBeenCalled();
});

it('counts acknowledged close replays after failed progress persistence and stops after a durable receipt', async () => {
  const fetchImpl = vi.fn(async () => Response.json({}));
  const provider = client(fetchImpl);
  const state = pending();
  state.budget.pendingPublications = [publication];
  const persist = vi.fn(async () => {
    throw new Error('storage unavailable');
  });
  for (let restart = 0; restart < 24; restart++) {
    await expect(
      closeBudgetPublications(
        structuredClone(state),
        (input) => provider.closeTracks(input),
        persist
      )
    ).rejects.toThrow('storage unavailable');
  }
  expect(fetchImpl).toHaveBeenCalledTimes(24);
  expect(persist).toHaveBeenCalledTimes(24);
  const save = vi.fn(async () => {});
  const completed = await closeBudgetPublications(
    state,
    (input) => provider.closeTracks(input),
    save
  );
  expect(save).toHaveBeenCalledTimes(1);
  expect(completed.budget?.pendingPublications).toEqual([]);
  for (let restart = 0; restart < 24; restart++) {
    await closeBudgetPublications(
      structuredClone(completed),
      (input) => provider.closeTracks(input),
      save
    );
  }
  expect(fetchImpl).toHaveBeenCalledTimes(25);
  expect(save).toHaveBeenCalledTimes(1);
});
