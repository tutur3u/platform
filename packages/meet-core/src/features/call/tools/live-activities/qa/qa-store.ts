import type {
  MeetRealtimeClientMessage,
  MeetRealtimeServerMessage,
} from '@tuturuuu/realtime/meet';

type SnapshotMessage = Extract<
  MeetRealtimeServerMessage,
  { type: 'qa.snapshot' }
>;
export type LiveQaSnapshot = SnapshotMessage['snapshot'];
export type LiveQaQuestion = LiveQaSnapshot['questions'][number];
export type LiveQaAnswer = NonNullable<LiveQaQuestion['answers']>[number];
export type LiveQaSelf = NonNullable<SnapshotMessage['self']>;
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

/** What the panel renders: the newest view this person may see. */
export type LiveQaView = {
  snapshot: LiveQaSnapshot;
  /** The room's key for this connection, which its votes are stored under. */
  self: LiveQaSelf | null;
  /** Whether the room sends this person the full host view. */
  isHost: boolean;
  /** The room's refusal of this person's latest request, if any. */
  error: string | null;
};

/** Request ids this client sends, so it only reports its own refusals. */
export const LIVE_QA_REQUEST_PREFIX = 'qa:';

const EMPTY: LiveQaSnapshot = { questions: [] };
const EMPTY_VIEW: LiveQaView = {
  snapshot: EMPTY,
  self: null,
  isHost: false,
  error: null,
};

/**
 * One read model per mounted client, populated only by room messages. A host
 * view counts only while it is at least as new as the shared one, so a
 * person who stops hosting falls back to what everyone sees.
 */
export function createLiveQaClient(
  channel: LiveQaChannel,
  { requestTimeoutMs = 10_000 }: { requestTimeoutMs?: number } = {}
) {
  let shared = EMPTY;
  let host: LiveQaSnapshot | null = null;
  let self: LiveQaSelf | null = null;
  let error: string | null = null;
  let view = EMPTY_VIEW;
  let sequence = 0;
  const listeners = new Set<() => void>();
  const waiting = new Map<string, (error: string | null) => void>();
  let stop: (() => void) | undefined;
  const publish = () => {
    const current =
      host && (host.revision ?? 0) >= (shared.revision ?? 0) ? host : null;
    view = { snapshot: current ?? shared, self, isHost: !!current, error };
    for (const notify of listeners) notify();
  };
  const settle = (requestId: string | undefined, outcome: string | null) => {
    const resolve = requestId ? waiting.get(requestId) : undefined;
    if (!resolve || !requestId) return;
    waiting.delete(requestId);
    resolve(outcome);
  };
  const receive = (message: MeetRealtimeServerMessage) => {
    if (message.type === 'qa.snapshot') {
      // A held broadcast can arrive after a newer reply; keep the newer one.
      if ((message.snapshot.revision ?? 0) >= (shared.revision ?? 0))
        shared = message.snapshot;
      if (message.self) self = message.self;
      if (message.requestId?.startsWith(LIVE_QA_REQUEST_PREFIX)) error = null;
      settle(message.requestId, null);
    } else if (message.type === 'qa.host') host = message.snapshot;
    else if (
      message.type === 'error' &&
      message.requestId?.startsWith(LIVE_QA_REQUEST_PREFIX)
    ) {
      error = message.error;
      settle(message.requestId, message.error);
    } else return;
    publish();
  };
  const send = (message: LiveQaCommand) => {
    const requestId = `${LIVE_QA_REQUEST_PREFIX}${++sequence}`;
    channel.send({ ...message, requestId });
    return requestId;
  };
  return {
    read: () => view,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (!stop) {
        stop = channel.subscribe(receive);
        send({ type: 'qa.read' });
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          stop?.();
          stop = undefined;
        }
      };
    },
    send,
    /**
     * Sends a command and resolves once the room answers it: null when it was
     * applied, or the refusal. No answer in time counts as a refusal.
     */
    request(message: LiveQaCommand) {
      return new Promise<string | null>((resolve) => {
        const requestId = send(message);
        waiting.set(requestId, resolve);
        setTimeout(() => settle(requestId, 'qa_timeout'), requestTimeoutMs);
      });
    },
    /**
     * Forgets the views and the vote marks of an earlier admission. The next read fills them
     * again, so a host view never outlives the role that received it.
     */
    reset() {
      shared = EMPTY;
      host = null;
      self = null;
      error = null;
      publish();
    },
    dismissError() {
      if (!error) return;
      error = null;
      publish();
    },
  };
}
export type LiveQaClient = ReturnType<typeof createLiveQaClient>;
