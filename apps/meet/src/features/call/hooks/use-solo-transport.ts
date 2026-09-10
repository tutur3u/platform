import { useEffect } from 'react';
import type { MeetSignaling } from '../lib/signaling';

type Ref<T> = { current: T };

/** Capture remains local while the room has no other receiving device. */
export function useSoloTransport(
  audience: number,
  admitted: boolean,
  refs: {
    session: Ref<string | null>;
    signaling: Ref<MeetSignaling | null>;
  },
  resetPublisher: () => void,
  resetSubscriber: () => void,
  resume: () => void
) {
  const { session, signaling } = refs;
  useEffect(() => {
    if (!admitted) return;
    if (audience > 0) {
      resume();
      return;
    }
    const id = session.current;
    // Invalidate in-flight publication before retiring its room registration.
    resetPublisher();
    resetSubscriber();
    if (id) signaling.current?.send({ type: 'media.idle', sessionId: id });
  }, [
    audience,
    admitted,
    session,
    signaling,
    resetPublisher,
    resetSubscriber,
    resume,
  ]);
}
