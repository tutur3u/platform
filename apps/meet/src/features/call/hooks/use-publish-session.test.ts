// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../lib/peer-recovery', () => ({ watchPeerRecovery: vi.fn() }));
vi.mock('../lib/peer-connection', () => ({
  PEER_CONFIG: {},
  configurePeerIce: vi.fn(),
}));

import type { MeetSignaling } from '../lib/signaling';
import { usePublishSession } from './use-publish-session';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it('closes a failed publisher before a later attempt creates another peer', async () => {
  vi.useFakeTimers();
  const close = vi.fn();
  const recovered = vi.fn();
  vi.stubGlobal(
    'RTCPeerConnection',
    class {
      close = close;
    }
  );
  const peer = { current: null as RTCPeerConnection | null };
  const session = { current: null as string | null };
  const request = vi
    .fn()
    .mockRejectedValueOnce(new Error('timeout'))
    .mockResolvedValue({ sessionId: 'new' });
  const hook = renderHook(() =>
    usePublishSession(
      peer,
      session,
      { current: { request } as unknown as MeetSignaling },
      (recover) => {
        if (recover) recovered();
        peer.current?.close();
        peer.current = null;
        session.current = null;
      }
    )
  );
  const ensure = hook.result.current;
  await expect(ensure()).rejects.toThrow('timeout');
  expect(close).toHaveBeenCalledOnce();
  expect(peer.current).toBeNull();
  expect(recovered).not.toHaveBeenCalled();
  await act(() => vi.advanceTimersByTimeAsync(1500));
  expect(recovered).toHaveBeenCalledOnce();
  expect(await ensure()).toHaveProperty('sessionId', 'new');
  hook.unmount();
});
