import type { coordinate } from '@tuturuuu/utils/coordination';
import { v7 } from 'uuid';
import { describe, expect, it, vi } from 'vitest';
import {
  assertRecentMeetingRequest,
  withMeetingRequest,
} from './meeting-request';

vi.mock('server-only', () => ({}));
const args = () => ({
  id: 'actor-workspace-bound-event',
  hash: 'a'.repeat(64),
  requestId: v7(),
});
function client() {
  return vi.fn<typeof coordinate>().mockImplementation(async ({ action }) => {
    if (action === 'acquire')
      return { outcome: 'acquired', fresh: true, completed: false };
    if (action === 'complete') return { outcome: 'completed' };
    return { outcome: 'released' };
  });
}
describe('meeting delivery retry guard', () => {
  it('accepts recent UUIDv7 requests and rejects old/future/untimestamped identifiers', () => {
    const now = Date.now();
    expect(() =>
      assertRecentMeetingRequest(v7({ msecs: now }), now)
    ).not.toThrow();
    for (const request of [
      v7({ msecs: now - 16 * 60_000 }),
      v7({ msecs: now + 61_000 }),
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    ])
      expect(() => assertRecentMeetingRequest(request, now)).toThrow();
  });
  it('passes persisted retry state and hashes the entity identity', async () => {
    const send = client();
    send.mockResolvedValueOnce({
      outcome: 'acquired',
      fresh: false,
      completed: true,
    });
    const run = vi.fn(async () => 'already handled');
    await expect(withMeetingRequest(args(), run, send)).resolves.toBe(
      'already handled'
    );
    expect(run).toHaveBeenCalledWith({
      fresh: false,
      completed: true,
      canCreate: true,
    });
    expect(send).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        namespace: 'meeting',
        key: expect.stringMatching(/^[a-f0-9]{64}$/),
        fingerprint: 'a'.repeat(64),
      })
    );
    expect(send.mock.calls.map(([input]) => input.action)).toEqual([
      'acquire',
      'complete',
      'release',
    ]);
  });
  it('blocks simultaneous sends and changed meeting details', async () => {
    for (const outcome of ['busy', 'conflict'] as const) {
      const send = client().mockResolvedValueOnce({ outcome });
      const run = vi.fn();
      await expect(withMeetingRequest(args(), run, send)).rejects.toMatchObject(
        { status: 409 }
      );
      expect(run).not.toHaveBeenCalled();
    }
  });
  it('fails closed when coordination is unavailable', async () => {
    const send = client().mockRejectedValueOnce(
      new Error('private provider error')
    );
    const run = vi.fn();
    await expect(withMeetingRequest(args(), run, send)).rejects.toMatchObject({
      status: 503,
      message: 'Meeting delivery is temporarily unavailable',
    });
    expect(run).not.toHaveBeenCalled();
  });
  it('releases the same owner after provider failure without recording completion', async () => {
    const send = client();
    await expect(
      withMeetingRequest(
        args(),
        async () => {
          throw new Error('provider timeout');
        },
        send
      )
    ).rejects.toThrow('provider timeout');
    expect(send.mock.calls.map(([input]) => input.action)).toEqual([
      'acquire',
      'release',
    ]);
    expect(send.mock.calls[1]?.[0].owner).toBe(send.mock.calls[0]?.[0].owner);
  });
  it('preserves a completed provider result when its lease expires or cleanup fails', async () => {
    for (const expired of [false, true]) {
      const send = client();
      send.mockResolvedValueOnce({
        outcome: 'acquired',
        fresh: true,
        completed: false,
      });
      if (expired) send.mockResolvedValueOnce({ outcome: 'lost' });
      else send.mockRejectedValueOnce(new Error('offline'));
      send.mockRejectedValueOnce(new Error('cleanup failed'));
      await expect(
        withMeetingRequest(args(), async () => 'created', send)
      ).resolves.toBe('created');
      expect(send).toHaveBeenCalledTimes(3);
    }
  });
});
