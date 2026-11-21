import type {
  MeetRealtimeClientMessage,
  MeetRealtimeServerMessage,
} from '@tuturuuu/realtime/meet';

export type LiveQaSnapshot = Extract<
  MeetRealtimeServerMessage,
  { type: 'qa.snapshot' }
>['snapshot'];
export type LiveQaCommand = Extract<
  MeetRealtimeClientMessage,
  { type: `qa.${string}` }
>;
export type LiveQaChannel = {
  send: (message: LiveQaCommand) => void;
  subscribe: (
    listener: (message: MeetRealtimeServerMessage) => void
  ) => () => void;
};

const EMPTY: LiveQaSnapshot = { questions: [] };
/** One read model per mounted client, populated only by room messages. */
export function createLiveQaClient(channel: LiveQaChannel) {
  let snapshot = EMPTY;
  const listeners = new Set<() => void>();
  let stop: (() => void) | undefined;
  return {
    read: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (!stop) {
        stop = channel.subscribe((message) => {
          if (message.type !== 'qa.snapshot') return;
          snapshot = message.snapshot;
          for (const notify of listeners) notify();
        });
        channel.send({ type: 'qa.read' });
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          stop?.();
          stop = undefined;
        }
      };
    },
    send: (message: LiveQaCommand) => channel.send(message),
  };
}
export type LiveQaClient = ReturnType<typeof createLiveQaClient>;
