// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { MeetSignaling } from '../lib/signaling';
import { useSoloTransport } from './use-solo-transport';

it('repeats retirement after reconnect even though the local session was already reset', () => {
  const session = { current: 'old' as string | null };
  const send = vi.fn();
  const refs = {
    session,
    signaling: { current: { send } as unknown as MeetSignaling },
  };
  const reset = () => {
    session.current = null;
  };
  const subscriber = vi.fn(),
    resume = vi.fn();
  const hook = renderHook(
    ({ status }) =>
      useSoloTransport(0, true, status, refs, reset, subscriber, resume),
    { initialProps: { status: 'reconnecting' } }
  );
  expect(session.current).toBeNull();
  expect(send).not.toHaveBeenCalled();
  hook.rerender({ status: 'open' });
  expect(send).toHaveBeenLastCalledWith({
    type: 'media.idle',
    sessionId: 'old',
  });
  hook.rerender({ status: 'reconnecting' });
  hook.rerender({ status: 'open' });
  expect(send).toHaveBeenCalledTimes(2);
  hook.unmount();
});
