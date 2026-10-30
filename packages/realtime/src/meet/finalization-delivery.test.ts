import { describe, expect, it, vi } from 'vitest';
import type { MeetFinalization, MeetFinalizationState } from './finalization';
import { drainFinalizations } from './finalization-token';

const sessionId = '44444444-4444-4444-8444-444444444444';
const id = '11111111-1111-4111-8111-111111111111';
const base = 1_800_000_000_000;
const env = {
  MEET_FINALIZE_URL: 'https://meet.example/api/meet-ai/finalize',
  MEET_REALTIME_TOKEN_SECRET: 'secret',
};
const record = (patch: Partial<MeetFinalization> = {}): MeetFinalization => ({
  sessionId,
  meetingId: id,
  wsId: id,
  consentedAccountIds: [id],
  readerAccountIds: [],
  queuedAt: base,
  attempts: 0,
  nextAttemptAt: base,
  status: 'pending',
  ...patch,
});
function harness(fetcher: typeof fetch, initial = record()) {
  const box = {
    state: { finalizations: { [sessionId]: initial } } as MeetFinalizationState,
  };
  const writes: Array<MeetFinalization | undefined> = [];
  let clock = base;
  const io = () => ({
    read: () => box.state,
    write: async (next: MeetFinalizationState) => {
      box.state = next;
      writes.push(next.finalizations?.[sessionId]);
    },
    now: () => clock,
    fetch: fetcher,
  });
  return {
    box,
    writes,
    run: () => drainFinalizations(env, io()),
    advance: (ms: number) => (clock += ms),
  };
}

describe('finalization delivery', () => {
  it('persists the spent attempt before the request leaves', async () => {
    let persistedAtSend: MeetFinalization | undefined;
    const h = harness(
      vi.fn(async () => {
        persistedAtSend = h.box.state.finalizations?.[sessionId];
        return Response.json({ status: 'completed' });
      }) as unknown as typeof fetch
    );
    await h.run();
    expect(persistedAtSend).toMatchObject({ attempts: 1, status: 'pending' });
    expect(persistedAtSend?.nextAttemptAt).toBeGreaterThan(base);
    expect(h.writes.at(-1)).toMatchObject({ status: 'done' });
  });

  it('never exceeds the attempt budget across restarts', async () => {
    const fetcher = vi.fn(async () => new Response('x', { status: 503 }));
    const h = harness(fetcher as unknown as typeof fetch);
    for (let i = 0; i < 40; i++) {
      h.advance(10 * 60_000);
      await h.run();
    }
    expect(fetcher).toHaveBeenCalledTimes(6);
    expect(h.box.state.finalizations?.[sessionId]?.status).toBe('abandoned');
  });

  it('waits out the backoff and ignores finished records', async () => {
    const fetcher = vi.fn(async () => Response.json({ status: 'pending' }));
    const h = harness(fetcher as unknown as typeof fetch);
    await h.run();
    await h.run();
    expect(fetcher).toHaveBeenCalledTimes(1);
    const done = harness(
      fetcher as unknown as typeof fetch,
      record({ status: 'done' })
    );
    await done.run();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does nothing while the finalize URL is unset', async () => {
    const fetcher = vi.fn();
    const h = harness(fetcher as unknown as typeof fetch);
    await drainFinalizations(
      { MEET_REALTIME_TOKEN_SECRET: 'secret' },
      {
        read: () => h.box.state,
        write: async () => {
          throw new Error('unexpected write');
        },
        fetch: fetcher as unknown as typeof fetch,
      }
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
});
