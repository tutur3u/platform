import { describe, expect, it, vi } from 'vitest';
import {
  FLEET_NO_PROJECT,
  getFleetBridgeLive,
  getFleetThreadReply,
  isFleetReplySettled,
  listFleetThreadMachines,
  listFleetThreadMessages,
  listFleetThreadProjects,
  listFleetThreads,
  markFleetThreadRead,
  sendFleetThreadReply,
} from './mastermind-threads';

const baseUrl = 'https://tuturuuu.com';
const FLEET = `${baseUrl}/api/v1/mastermind/fleet`;
const THREAD = 'thread:project:mcp%3Aabc:1234';
const REPLY = '7d3c2f1e-4b5a-4c6d-8e7f-9a0b1c2d3e4f';

function recorder(body: unknown, status = 200) {
  return vi.fn(
    async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      })
  );
}

const thread = {
  threadId: THREAD,
  title: 'Fix the build',
  projectId: 'p1',
  project: 'Platform',
  state: 'running',
  updatedAt: '2026-11-21T05:00:00.000Z',
  itemCount: 12,
};
const reply = {
  id: REPLY,
  machineId: 'skr-m4',
  threadId: THREAD,
  state: 'delivered',
  delivery: 'steered',
  createdAt: '2026-11-21T05:00:00.000Z',
  settledAt: '2026-11-21T05:00:01.000Z',
};

describe('Mastermind fleet thread client', () => {
  it('lists threads with every filter in the query, and nothing it was not given', async () => {
    const page = {
      machineId: 'skr-m4',
      threads: [{ ...thread, seenItemCount: 10, lastOwnerReplyAt: 't' }],
      nextCursor: 50,
      total: 76,
    };
    const fetch = recorder(page);
    const result = await listFleetThreads(
      {
        machineId: 'skr-m4',
        environmentId: 'env-2',
        query: '  build ',
        projectId: FLEET_NO_PROJECT,
        state: 'failed',
        ownerReply: true,
        cursor: 50,
        limit: 20,
      },
      { baseUrl, fetch }
    );
    expect(result).toEqual({ ok: true, data: page });
    const url = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(url.origin + url.pathname).toBe(`${FLEET}/threads`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      machineId: 'skr-m4',
      environmentId: 'env-2',
      q: 'build',
      projectId: 'none',
      state: 'failed',
      include: 'ownerReply',
      cursor: '50',
      limit: '20',
    });
    expect(fetch.mock.calls[0]?.[1]?.cache).toBe('no-store');

    await listFleetThreads(
      { machineId: 'skr-m4', query: '  ' },
      { baseUrl, fetch }
    );
    expect(String(fetch.mock.calls[1]?.[0])).toBe(
      `${FLEET}/threads?machineId=skr-m4`
    );
  });

  it('reads machines, projects, history and the live machines from their routes', async () => {
    const fetch = recorder({});
    const options = { baseUrl, fetch };
    await listFleetThreadMachines({ machineId: 'skr-m4' }, options);
    await listFleetThreadProjects({ machineId: 'skr-m4' }, options);
    await listFleetThreadMessages(
      { machineId: 'skr-m4', threadId: THREAD, before: 120, limit: 30 },
      options
    );
    await getFleetBridgeLive(options);
    await getFleetThreadReply(REPLY, options);
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
      `${FLEET}/threads/machines?machineId=skr-m4`,
      `${FLEET}/threads/projects?machineId=skr-m4`,
      `${FLEET}/threads/messages?machineId=skr-m4&threadId=${encodeURIComponent(THREAD)}&before=120&limit=30`,
      `${FLEET}/live`,
      `${FLEET}/replies/${REPLY}`,
    ]);
  });

  it('accepts each route body in its documented shape', async () => {
    const counts = { running: 1, waiting: 0, failed: 2, idle: 40 };
    const bodies = [
      [
        listFleetThreadMachines,
        {
          machineId: 'skr-m4',
          machines: [
            { label: 'This machine', reachable: true },
            { environmentId: 'env-2', label: 'MacStudio1', reachable: false },
          ],
        },
      ],
      [
        listFleetThreadProjects,
        {
          machineId: 'skr-m4',
          projects: [
            {
              projectId: 'p1',
              project: 'Platform',
              threadCount: 43,
              counts,
              latestUpdatedAt: '2026-11-21T05:00:00.000Z',
            },
          ],
          unassigned: { threadCount: 0, counts: { ...counts, failed: 0 } },
          total: 1,
        },
      ],
      [
        (input: { machineId: string }, options: object) =>
          listFleetThreadMessages({ ...input, threadId: THREAD }, options),
        {
          machineId: 'skr-m4',
          thread,
          messages: [
            {
              position: 7,
              role: 'user',
              text: 'go on',
              truncated: false,
              at: '2026-11-21T05:00:00.000Z',
            },
          ],
          earlierPosition: null,
        },
      ],
    ] as const;
    for (const [read, body] of bodies)
      expect(
        await read({ machineId: 'skr-m4' }, { baseUrl, fetch: recorder(body) })
      ).toEqual({ ok: true, data: body });
  });

  it('sends a reply once per key, as JSON, with the key in its header', async () => {
    const fetch = recorder({ ...reply, state: 'sent' }, 202);
    const sent = await sendFleetThreadReply(
      {
        machineId: 'skr-m4',
        threadId: THREAD,
        text: 'Ship it.',
        idempotencyKey: REPLY,
      },
      { baseUrl, fetch }
    );
    expect(sent.ok && sent.data.state).toBe('sent');
    expect(sent.ok && isFleetReplySettled(sent.data)).toBe(false);
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe(`${FLEET}/replies`);
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('idempotency-key')).toBe(REPLY);
    expect(JSON.parse(String(init?.body))).toEqual({
      machineId: 'skr-m4',
      threadId: THREAD,
      text: 'Ship it.',
    });

    const settled = await getFleetThreadReply(REPLY, {
      baseUrl,
      fetch: recorder(reply),
    });
    expect(settled).toEqual({ ok: true, data: reply });
    expect(settled.ok && isFleetReplySettled(settled.data)).toBe(true);
  });

  it('records a read marker', async () => {
    const fetch = recorder({ saved: true });
    const marker = { machineId: 'skr-m4', threadId: THREAD, itemCount: 12 };
    expect(await markFleetThreadRead(marker, { baseUrl, fetch })).toEqual({
      ok: true,
      data: { saved: true },
    });
    expect(String(fetch.mock.calls[0]?.[0])).toBe(`${FLEET}/threads/read`);
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual(marker);
  });

  it('turns every refusal into a state, never a thrown error', async () => {
    const read = (body: unknown, status: number) =>
      listFleetThreads(
        { machineId: 'skr-m4' },
        { baseUrl, fetch: recorder(body, status) }
      );
    for (const [body, status, error] of [
      [{ error: 'machine_offline' }, 503, 'machine_offline'],
      [{ error: 'unavailable' }, 503, 'unavailable'],
      [{ error: 'timeout' }, 504, 'timeout'],
      [{ error: 'unknown_thread' }, 404, 'unknown_thread'],
      [{ error: 'rate_limited' }, 429, 'rate_limited'],
      [{ error: 'forbidden' }, 403, 'forbidden'],
      [{ error: 'invalid_query' }, 422, 'invalid_query'],
      [
        { error: 'unsupported_for_linked_machine' },
        422,
        'unsupported_for_linked_machine',
      ],
      // A code this client does not know falls back on the status.
      [{ error: 'something_new' }, 429, 'rate_limited'],
      [{ error: 'something_new' }, 500, 'unavailable'],
      [{ message: 'Unauthorized' }, 401, 'unauthorized'],
      [undefined, 502, 'unavailable'],
    ] as const)
      expect(await read(body, status)).toEqual({ ok: false, error, status });

    // A reply that needs a newer second-factor proof says how new.
    const refused = await sendFleetThreadReply(
      {
        machineId: 'skr-m4',
        threadId: THREAD,
        text: 'x',
        idempotencyKey: REPLY,
      },
      {
        baseUrl,
        fetch: recorder({ error: 'mfa_required', maxAgeSeconds: 1800 }, 401),
      }
    );
    expect(refused).toEqual({
      ok: false,
      error: 'mfa_required',
      status: 401,
      maxAgeSeconds: 1800,
    });

    // No response at all.
    const offline = await listFleetThreads(
      { machineId: 'skr-m4' },
      {
        baseUrl,
        fetch: vi.fn(async () => {
          throw new TypeError('fetch failed');
        }),
      }
    );
    expect(offline).toEqual({ ok: false, error: 'unavailable', status: 0 });
  });

  it('refuses a body that is not in the documented shape', async () => {
    for (const body of [
      null,
      { machineId: 'skr-m4', threads: 'none', nextCursor: null, total: 0 },
      {
        machineId: 'skr-m4',
        threads: [{ ...thread, state: 'exploded' }],
        nextCursor: null,
        total: 1,
      },
      {
        machineId: 'skr-m4',
        threads: [{ ...thread, threadId: 'has space' }],
        nextCursor: null,
        total: 1,
      },
    ])
      expect(
        await listFleetThreads(
          { machineId: 'skr-m4' },
          { baseUrl, fetch: recorder(body) }
        )
      ).toEqual({ ok: false, error: 'invalid_response', status: 200 });
  });

  it('keeps the change notices of the live read, and any project id a thread carries', async () => {
    const live = {
      machines: [
        {
          machineId: 'skr-m4',
          connected: true,
          connectedAt: '2026-11-21T05:00:00.000Z',
          lastSeenAt: '2026-11-21T05:00:30.000Z',
        },
      ],
      pokes: [
        {
          machineId: 'skr-m4',
          topic: 'threads',
          revision: 7,
          observedAt: '2026-11-21T05:00:20.000Z',
        },
      ],
    };
    expect(
      await getFleetBridgeLive({ baseUrl, fetch: recorder(live) })
    ).toEqual({ ok: true, data: live });

    // The route passes a thread's project id through as the machine has it.
    const page = {
      machineId: 'skr-m4',
      threads: [{ ...thread, projectId: 'team/platform one' }],
      nextCursor: null,
      total: 1,
    };
    expect(
      await listFleetThreads(
        { machineId: 'skr-m4' },
        { baseUrl, fetch: recorder(page) }
      )
    ).toEqual({ ok: true, data: page });
  });
});
