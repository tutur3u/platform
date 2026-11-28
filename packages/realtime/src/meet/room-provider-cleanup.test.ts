import { expect, it, vi } from 'vitest';
import type { MeetRealtimeRoomTrack } from './messages';
import { createMeetRoomSnapshot, type MeetRoomSnapshot } from './room';
import {
  closeBudgetPublications,
  describeProviderCleanupError,
} from './room-provider-cleanup';
import { CloudflareSfuError } from './sfu';

function snapshot(tracks: MeetRealtimeRoomTrack[]) {
  return {
    ...createMeetRoomSnapshot(),
    budget: {
      expiresAt: 1,
      accountedAt: 1,
      participantMilliseconds: 0,
      maxPublishers: 8,
      maxViewers: 96,
      pendingPublications: tracks,
    },
  };
}
const one = { sessionId: 'one', userId: 'host', trackName: 'audio', mid: '0' };
it('persists successful mids from mixed close results and retries only failures', async () => {
  let state: MeetRoomSnapshot = snapshot([
    one,
    { ...one, trackName: 'video', mid: '1' },
  ]);
  const close = vi.fn().mockResolvedValue({
    tracks: [{ mid: '0' }, { mid: '1', errorCode: 'temporary' }],
  });
  await expect(
    closeBudgetPublications(state, close, async (next) => {
      state = next;
    })
  ).rejects.toThrow('cleanup failed');
  expect(state.budget?.pendingPublications?.map((track) => track.mid)).toEqual([
    '1',
  ]);
  const retry = vi.fn().mockResolvedValue({ tracks: [{ mid: '1' }] });
  expect(
    (await closeBudgetPublications(state, retry)).budget?.pendingPublications
  ).toEqual([]);
  expect(retry).toHaveBeenCalledWith({
    sessionId: 'one',
    force: true,
    tracks: [{ mid: '1' }],
  });
});
it('resolves a legacy track using the local provider track name and closes its actual mid', async () => {
  const state = snapshot([{ ...one, mid: undefined }]);
  const lookup = vi.fn().mockResolvedValue({
    tracks: [
      { location: 'remote', trackName: 'audio', mid: '9' },
      { location: 'local', trackName: 'audio', mid: '2' },
    ],
  });
  const close = vi.fn().mockResolvedValue({ tracks: [{ mid: '2' }] });
  expect(
    (await closeBudgetPublications(state, close, undefined, lookup)).budget
      ?.pendingPublications
  ).toEqual([]);
  expect(close).toHaveBeenCalledWith({
    sessionId: 'one',
    force: true,
    tracks: [{ mid: '2' }],
  });
});
it('continues other sessions when a legacy publication cannot be identified', async () => {
  let state: MeetRoomSnapshot = snapshot([
    { ...one, mid: undefined, trackName: undefined },
    { ...one, sessionId: 'two' },
  ]);
  const close = vi.fn().mockResolvedValue({});
  await expect(
    closeBudgetPublications(
      state,
      close,
      async (next) => {
        state = next;
      },
      async () => ({ tracks: [] })
    )
  ).rejects.toThrow('provider track identifier');
  expect(state.budget?.pendingPublications).toHaveLength(1);
  expect(close).toHaveBeenCalledWith({
    sessionId: 'two',
    force: true,
    tracks: [{ mid: '0' }],
  });
});
it('does not discard legacy cleanup on a malformed provider inventory', async () => {
  let state: MeetRoomSnapshot = snapshot([{ ...one, mid: undefined }]);
  const close = vi.fn();
  await expect(
    closeBudgetPublications(
      state,
      close,
      async (next) => {
        state = next;
      },
      async () => ({ tracks: [{}] })
    )
  ).rejects.toThrow('lookup failed');
  expect(state.budget?.pendingPublications).toHaveLength(1);
  expect(close).not.toHaveBeenCalled();
});
it('recognizes a missing legacy publication only from a complete provider inventory', async () => {
  const close = vi.fn();
  const result = await closeBudgetPublications(
    snapshot([{ ...one, mid: undefined }]),
    close,
    undefined,
    async () => ({ tracks: [] })
  );
  expect(result.budget?.pendingPublications).toEqual([]);
  expect(close).not.toHaveBeenCalled();
});

it('recovers closure after persistence fails without treating arbitrary close errors as success', async () => {
  const state = snapshot([one]);
  await expect(
    closeBudgetPublications(
      state,
      async () => ({ tracks: [{ mid: '0' }] }),
      async () => {
        throw new Error('storage unavailable');
      }
    )
  ).rejects.toThrow('storage unavailable');
  expect(state.budget.pendingPublications).toHaveLength(1);
  const close = vi.fn().mockResolvedValue({
    tracks: [{ mid: '0', errorCode: 'not_found_track_error' }],
  });
  const recovered = await closeBudgetPublications(
    state,
    close,
    undefined,
    async () => ({ tracks: [] })
  );
  expect(recovered.budget?.pendingPublications).toEqual([]);
});
it('retains a failed closure when the provider still lists its mid', async () => {
  const state = snapshot([one]);
  await expect(
    closeBudgetPublications(
      state,
      async () => ({ tracks: [{ mid: '0', errorCode: 'temporary' }] }),
      undefined,
      async () => ({
        tracks: [{ location: 'local', trackName: 'audio', mid: '0' }],
      })
    )
  ).rejects.toThrow('cleanup failed');
  expect(state.budget.pendingPublications).toHaveLength(1);
});

it.each([404, 410])(
  'treats HTTP %i on tracks/close as confirmed without calling getSession',
  async (status) => {
    const close = vi
      .fn()
      .mockRejectedValue(
        new CloudflareSfuError(
          `cloudflare_sfu_request_failed:${status} {"errorCode":"not_found_session_error"}`,
          status,
          'not_found_session_error',
          'Session not found'
        )
      );
    const getSession = vi.fn();
    const cleaned = await closeBudgetPublications(
      snapshot([one, { ...one, trackName: 'video', mid: '1' }]),
      close,
      undefined,
      getSession
    );
    expect(cleaned.budget?.pendingPublications).toEqual([]);
    expect(close).toHaveBeenCalledTimes(1);
    expect(getSession).not.toHaveBeenCalled();
  }
);

it('treats HTTP 404 on fallback or legacy getSession as confirmed', async () => {
  const gone = new Error(
    'cloudflare_sfu_request_failed:404 {"errorDescription":"Session not found"}'
  );
  const recovered = await closeBudgetPublications(
    snapshot([one]),
    async () => ({ tracks: [{ mid: '0', errorCode: 'temporary' }] }),
    undefined,
    async () => {
      throw gone;
    }
  );
  expect(recovered.budget?.pendingPublications).toEqual([]);

  const legacy = await closeBudgetPublications(
    snapshot([{ ...one, mid: undefined }]),
    vi.fn(),
    undefined,
    async () => {
      throw gone;
    }
  );
  expect(legacy.budget?.pendingPublications).toEqual([]);
});

it.each([
  {
    name: 'app_not_found JSON 404',
    error: new CloudflareSfuError(
      'cloudflare_sfu_request_failed:404 {"errorCode":"app_not_found","errorDescription":"App not found"}',
      404,
      'app_not_found',
      'App not found'
    ),
  },
  {
    name: 'not_found_app_error JSON 404',
    error: new CloudflareSfuError(
      'cloudflare_sfu_request_failed:404 {"errorCode":"not_found_app_error","errorDescription":"App not found"}',
      404,
      'not_found_app_error',
      'App not found'
    ),
  },
  {
    name: 'route_not_found JSON 404',
    error: new CloudflareSfuError(
      'cloudflare_sfu_request_failed:404 {"errorCode":"route_not_found","errorDescription":"Route not found"}',
      404,
      'route_not_found',
      'Route not found'
    ),
  },
  {
    name: 'HTML 404 proxy page',
    error: new CloudflareSfuError(
      'cloudflare_sfu_request_failed:404 <html><body><h1>404 Session not found</h1></body></html>',
      404
    ),
  },
  {
    name: 'bare 404 with no body',
    error: new CloudflareSfuError('cloudflare_sfu_request_failed:404', 404),
  },
  {
    name: 'bare 410 with no body',
    error: new CloudflareSfuError('cloudflare_sfu_request_failed:410', 410),
  },
  {
    name: 'unknown-shape JSON 404',
    error: new CloudflareSfuError(
      'cloudflare_sfu_request_failed:404 {"message":"Session not found","error":"session_not_found"}',
      404
    ),
  },
  {
    name: 'generic not_found JSON 404 without session description',
    error: new CloudflareSfuError(
      'cloudflare_sfu_request_failed:404 {"errorCode":"not_found"}',
      404,
      'not_found'
    ),
  },
])(
  'retries unrecognized $name instead of confirming closure',
  async ({ error }) => {
    const state = snapshot([one]);
    await expect(
      closeBudgetPublications(
        state,
        async () => {
          throw error;
        },
        undefined,
        async () => {
          throw error;
        }
      )
    ).rejects.toBe(error);
    expect(state.budget.pendingPublications).toHaveLength(1);
  }
);

it('treats already-closed track error codes and session-gone JSON responses as confirmed', async () => {
  const getSession = vi.fn();
  const trackClosed = await closeBudgetPublications(
    snapshot([one]),
    async () => ({
      tracks: [
        {
          mid: '0',
          errorCode: 'close_track_error',
          errorDescription: "Track doesn't exist or was already closed",
        },
      ],
    }),
    undefined,
    getSession
  );
  expect(trackClosed.budget?.pendingPublications).toEqual([]);
  expect(getSession).not.toHaveBeenCalled();

  const sessionGone = await closeBudgetPublications(
    snapshot([one]),
    async () => ({ errorCode: 'session_not_found' }),
    undefined,
    getSession
  );
  expect(sessionGone.budget?.pendingPublications).toEqual([]);
  expect(getSession).not.toHaveBeenCalled();

  const sessionExpired410 = await closeBudgetPublications(
    snapshot([one]),
    async () => {
      throw new CloudflareSfuError(
        'cloudflare_sfu_request_failed:410 {"errorDescription":"Session has expired"}',
        410,
        undefined,
        'Session has expired'
      );
    },
    undefined,
    getSession
  );
  expect(sessionExpired410.budget?.pendingPublications).toEqual([]);
  expect(getSession).not.toHaveBeenCalled();
});

it('summarizes provider cleanup errors without leaking raw bodies or identifiers', () => {
  expect(
    describeProviderCleanupError(
      new CloudflareSfuError(
        'cloudflare_sfu_request_failed:503 {"errorCode":"internal_error","sessionId":"secret"}',
        503,
        'internal_error'
      )
    )
  ).toEqual({
    reason: 'sfu_http_error',
    status: 503,
    errorCode: 'internal_error',
  });
  expect(
    describeProviderCleanupError(
      new CloudflareSfuError(
        'cloudflare_sfu_request_failed:404 {"errorCode":"route_not_found","errorDescription":"session-secret-123"}',
        404,
        'route_not_found',
        'session-secret-123'
      )
    )
  ).toEqual({
    reason: 'sfu_unrecognized_not_found',
    status: 404,
    errorCode: 'route_not_found',
  });
  expect(
    describeProviderCleanupError(
      new CloudflareSfuError(
        'cloudflare_sfu_request_failed:404 <html><body>secret-body</body></html>',
        404
      )
    )
  ).toEqual({
    reason: 'sfu_unrecognized_not_found',
    status: 404,
  });
  expect(describeProviderCleanupError(new TypeError('network down'))).toEqual({
    reason: 'provider_request_error',
  });
});
