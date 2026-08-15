import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import {
  optimisticallyRemoveTimeTrackingSession,
  restoreTimeTrackingSessionCache,
} from './session-history-cache';

describe('session history cache', () => {
  it('removes the deleted session from every loaded history page', async () => {
    const queryClient = new QueryClient();
    const historyKey = [
      'time-tracking-sessions',
      'workspace-1',
      'user-1',
      'history',
    ] as const;
    queryClient.setQueryData(historyKey, {
      pageParams: [null, 'cursor-1'],
      pages: [
        {
          hasMore: true,
          nextCursor: 'cursor-1',
          sessions: [{ id: 'session-1' }, { id: 'session-2' }],
          total: 3,
        },
        {
          hasMore: false,
          nextCursor: null,
          sessions: [{ id: 'session-1' }],
          total: 3,
        },
      ],
    });

    const snapshot = await optimisticallyRemoveTimeTrackingSession(
      queryClient,
      'workspace-1',
      'session-1'
    );

    expect(
      queryClient
        .getQueryData<{ pages: Array<{ sessions: Array<{ id: string }> }> }>(
          historyKey
        )
        ?.pages.flatMap((page) => page.sessions)
    ).toEqual([{ id: 'session-2' }]);
    expect(snapshot.history).toHaveLength(1);
  });

  it('restores history and running-session state after a failed delete', async () => {
    const queryClient = new QueryClient();
    const historyKey = [
      'time-tracking-sessions',
      'workspace-1',
      'user-1',
      'history',
    ] as const;
    const runningKey = ['running-time-session', 'user', 'workspace-1'] as const;
    const history = {
      pageParams: [null],
      pages: [
        {
          hasMore: false,
          nextCursor: null,
          sessions: [{ id: 'session-1' }],
          total: 1,
        },
      ],
    };
    const running = { id: 'session-1', ws_id: 'workspace-1' };
    queryClient.setQueryData(historyKey, history);
    queryClient.setQueryData(runningKey, running);

    const snapshot = await optimisticallyRemoveTimeTrackingSession(
      queryClient,
      'workspace-1',
      'session-1'
    );
    restoreTimeTrackingSessionCache(queryClient, snapshot);

    expect(queryClient.getQueryData(historyKey)).toEqual(history);
    expect(queryClient.getQueryData(runningKey)).toEqual(running);
  });
});
