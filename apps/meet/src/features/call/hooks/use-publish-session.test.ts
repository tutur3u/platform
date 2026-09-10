import { afterEach, expect, it, vi } from 'vitest';

vi.mock('react', () => ({ useCallback: (fn: unknown) => fn }));
vi.mock('../lib/peer-recovery', () => ({ watchPeerRecovery: vi.fn() }));
vi.mock('../lib/peer-connection', () => ({
  PEER_CONFIG: {},
  configurePeerIce: vi.fn(),
}));

import type { MeetSignaling } from '../lib/signaling';
import { usePublishSession } from './use-publish-session';

afterEach(() => vi.unstubAllGlobals());
it('closes a failed publisher before a later attempt creates another peer', async () => {
  const close = vi.fn();
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
  const ensure = usePublishSession(
    peer,
    session,
    { current: { request } as unknown as MeetSignaling },
    () => {
      peer.current?.close();
      peer.current = null;
      session.current = null;
    }
  );
  await expect(ensure()).rejects.toThrow('timeout');
  expect(close).toHaveBeenCalledOnce();
  expect(peer.current).toBeNull();
  expect(await ensure()).toHaveProperty('sessionId', 'new');
});
