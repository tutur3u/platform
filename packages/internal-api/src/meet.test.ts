import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  finalizeMeetPlan,
  getMeetPlanSnapshot,
  reopenMeetPlan,
  replaceMeetAvailability,
} from './meet';

const snapshot = {
  plan: { id: 'plan-id' },
  users: [],
  timeblocks: [],
  finalizedTimeframes: [],
  polls: { polls: [], userVotes: [], guestVotes: [] },
  viewer: { id: null, isCreator: false },
  revision: 'revision',
};

function mockFetch() {
  const fetch = vi.fn(
    async () =>
      new Response(JSON.stringify(snapshot), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
  );
  return fetch;
}

afterEach(() => vi.restoreAllMocks());

describe('Tuturuuu Meet internal API', () => {
  it('loads aggregate plan detail without caching', async () => {
    const fetch = mockFetch();
    await getMeetPlanSnapshot('plan/id', {
      baseUrl: 'https://example.test',
      fetch,
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://example.test/api/v1/meet/plans/plan%2Fid',
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  it('replaces a guest availability batch in one request', async () => {
    const fetch = mockFetch();
    await replaceMeetAvailability(
      'plan-id',
      {
        guestId: 'guest-id',
        passwordHash: 'hash',
        timeblocks: [
          {
            date: '2026-08-04',
            start_time: '09:00:00+07',
            end_time: '09:15:00+07',
            tentative: true,
          },
        ],
      },
      { baseUrl: 'https://example.test', fetch }
    );
    expect(fetch).toHaveBeenCalledWith(
      'https://example.test/api/v1/meet/plans/plan-id/availability',
      expect.objectContaining({ method: 'PUT' })
    );
  });

  it('finalizes multiple alternatives atomically', async () => {
    const fetch = mockFetch();
    await finalizeMeetPlan(
      'plan-id',
      {
        timeframes: [
          {
            startAt: '2026-08-04T02:00:00.000Z',
            endAt: '2026-08-04T03:00:00.000Z',
          },
          {
            startAt: '2026-08-05T02:00:00.000Z',
            endAt: '2026-08-05T03:00:00.000Z',
          },
        ],
      },
      { baseUrl: 'https://example.test', fetch }
    );
    expect(fetch).toHaveBeenCalledWith(
      'https://example.test/api/v1/meet/plans/plan-id/finalization',
      expect.objectContaining({ method: 'PUT' })
    );
  });

  it('reopens through the explicit delete operation', async () => {
    const fetch = mockFetch();
    await reopenMeetPlan('plan-id', { baseUrl: 'https://example.test', fetch });
    expect(fetch).toHaveBeenCalledWith(
      'https://example.test/api/v1/meet/plans/plan-id/finalization',
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});
