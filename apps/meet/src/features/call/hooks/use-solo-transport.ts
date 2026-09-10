import { useEffect, useRef } from 'react';
import type { MeetSignaling } from '../lib/signaling';

type Ref<T> = { current: T };

/** Capture remains local while the room has no other receiving device. */
export function useSoloTransport(
  audience: number,
  admitted: boolean,
  connectionStatus: string,
  refs: {
    session: Ref<string | null>;
    signaling: Ref<MeetSignaling | null>;
  },
  resetPublisher: () => void,
  resetSubscriber: () => void,
  resume: () => void
) {
  const { session, signaling } = refs;
  const retired = useRef(new Set<string>());
  useEffect(() => {
    if (!admitted) return;
    if (audience > 0) {
      resume();
    } else {
      const id = session.current;
      // Invalidate in-flight publication before retiring its room registration.
      resetPublisher();
      resetSubscriber();
      if (id) retired.current.add(id);
    }
    // Keep a bounded reconnect outbox: a send may be lost before socket closure.
    while (retired.current.size > 32)
      retired.current.delete(retired.current.values().next().value!);
    if (connectionStatus === 'open')
      for (const id of retired.current)
        signaling.current?.send({ type: 'media.idle', sessionId: id });
  }, [
    audience,
    admitted,
    connectionStatus,
    session,
    signaling,
    resetPublisher,
    resetSubscriber,
    resume,
  ]);
}
