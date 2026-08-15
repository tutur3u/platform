import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import {
  optimisticallyClearRunningTimeSession,
  restoreRunningTimeSessionCache,
  withOptimisticallyClearedRunningTimeSession,
} from './task-time-tracking-cache';

describe('running time session cache', () => {
  it('clears every matching running-session cache shape immediately', async () => {
    const queryClient = new QueryClient();
    const runningSession = { id: 'session-1', ws_id: 'workspace-1' };

    queryClient.setQueryData(
      ['running-time-session', 'workspace-1'],
      runningSession
    );
    queryClient.setQueryData(
      ['running-time-session', 'workspace-1', 'user-1'],
      runningSession
    );
    queryClient.setQueryData(
      ['running-time-session', 'user', 'personal'],
      runningSession
    );
    queryClient.setQueryData(['running-time-session', 'workspace-2'], {
      id: 'session-2',
      ws_id: 'workspace-2',
    });

    const snapshot = await optimisticallyClearRunningTimeSession(
      queryClient,
      'session-1'
    );

    expect(snapshot).toHaveLength(3);
    expect(
      queryClient.getQueryData(['running-time-session', 'workspace-1'])
    ).toBeNull();
    expect(
      queryClient.getQueryData([
        'running-time-session',
        'workspace-1',
        'user-1',
      ])
    ).toBeNull();
    expect(
      queryClient.getQueryData(['running-time-session', 'user', 'personal'])
    ).toBeNull();
    expect(
      queryClient.getQueryData(['running-time-session', 'workspace-2'])
    ).toMatchObject({ id: 'session-2' });
  });

  it('restores only matching cache entries when the mutation fails', async () => {
    const queryClient = new QueryClient();
    const runningSession = { id: 'session-1', ws_id: 'workspace-1' };
    const key = ['running-time-session', 'user', 'personal'] as const;
    queryClient.setQueryData(key, runningSession);

    const snapshot = await optimisticallyClearRunningTimeSession(
      queryClient,
      'session-1'
    );
    queryClient.setQueryData(['running-time-session', 'workspace-2'], {
      id: 'session-2',
    });
    restoreRunningTimeSessionCache(queryClient, snapshot);

    expect(queryClient.getQueryData(key)).toEqual(runningSession);
    expect(
      queryClient.getQueryData(['running-time-session', 'workspace-2'])
    ).toEqual({ id: 'session-2' });
  });

  it('rolls back an optimistic clear when stopping fails', async () => {
    const queryClient = new QueryClient();
    const key = ['running-time-session', 'user', 'personal'] as const;
    const runningSession = { id: 'session-1', ws_id: 'workspace-1' };
    queryClient.setQueryData(key, runningSession);

    await expect(
      withOptimisticallyClearedRunningTimeSession(
        queryClient,
        'session-1',
        async () => {
          expect(queryClient.getQueryData(key)).toBeNull();
          throw new Error('Stop failed');
        }
      )
    ).rejects.toThrow('Stop failed');

    expect(queryClient.getQueryData(key)).toEqual(runningSession);
  });
});
