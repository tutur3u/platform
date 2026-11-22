import type { MeetRealtimeServerMessage } from './messages';

/** How long the room holds its shared Q&A snapshot before sending it. */
export const LIVE_QA_BROADCAST_DELAY_MS = 200;

type Timer = ReturnType<typeof setTimeout>;

/**
 * Holds the room's shared Q&A snapshot for a short window, so a burst of
 * votes reaches each socket as one frame with the newest state. Only the
 * broadcast waits: the sender's reply, with its request id, goes at once and
 * already carries the new state. At most one snapshot and one timer are held,
 * and ending the room drops what is held.
 */
export function createLiveQaBroadcastWindow(
  emit: (messages: MeetRealtimeServerMessage[]) => void,
  {
    delayMs = LIVE_QA_BROADCAST_DELAY_MS,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
  }: {
    delayMs?: number;
    setTimer?: (run: () => void, ms: number) => Timer;
    clearTimer?: (timer: Timer) => void;
  } = {}
) {
  let held: MeetRealtimeServerMessage | null = null;
  let timer: Timer | null = null;
  const stop = () => {
    if (timer) clearTimer(timer);
    timer = null;
  };
  const flush = () => {
    stop();
    const message = held;
    held = null;
    if (message) emit([message]);
  };
  return {
    /** The messages to send now; a shared Q&A snapshot waits for the window. */
    hold(messages: MeetRealtimeServerMessage[]) {
      if (messages.some((message) => message.type === 'room.ended')) {
        held = null;
        stop();
      }
      const now: MeetRealtimeServerMessage[] = [];
      for (const message of messages)
        if (message.type === 'qa.snapshot' && !message.requestId)
          held = message;
        else now.push(message);
      if (held && !timer) timer = setTimer(flush, delayMs);
      return now;
    },
    flush,
  };
}
