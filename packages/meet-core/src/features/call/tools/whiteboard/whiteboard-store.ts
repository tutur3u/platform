import {
  type MeetRealtimeClientMessage,
  type MeetRealtimeServerMessage,
  penboardStrokeSchema,
} from '@tuturuuu/realtime/meet';
import type { WhiteboardStroke } from './stroke';

export type WhiteboardSnapshot = {
  strokes: readonly WhiteboardStroke[];
  canUndo: boolean;
  /** The room lets hosts, co-hosts and participant managers clear the board. */
  canClear: boolean;
};

type Send = (message: MeetRealtimeClientMessage) => boolean;
const EMPTY: WhiteboardSnapshot = {
  strokes: [],
  canUndo: false,
  canClear: false,
};
const MAX_PENDING_STROKES = 16;

function createWhiteboardStore() {
  let snapshot = EMPTY;
  let revision = 0;
  let authoritative = EMPTY.strokes;
  let readRequest: string | undefined;
  let selfId: string | undefined;
  let manager = false;
  let send: Send | undefined;
  const pending = new Map<string, WhiteboardStroke>();
  const listeners = new Set<() => void>();

  const publish = () => {
    const strokes = pending.size
      ? [...authoritative, ...pending.values()]
      : authoritative;
    snapshot = {
      strokes,
      canUndo: strokes.some(({ authorId }) => manager || authorId === selfId),
      canClear: manager,
    };
    for (const notify of listeners) notify();
  };

  const readRoom = () => {
    if (!send || readRequest) return;
    const requestId = `penboard-read:${crypto.randomUUID()}`;
    readRequest = requestId;
    if (!send({ type: 'penboard.read', requestId })) readRequest = undefined;
  };

  return {
    read: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    identify(userId: string, canManage: boolean) {
      selfId = userId;
      manager = canManage;
    },
    open(channel: Send) {
      send = channel;
      readRoom();
    },
    receive(message: MeetRealtimeServerMessage) {
      if (!send) return;
      if (message.type === 'penboard.snapshot') {
        if (message.revision < revision) return;
        readRequest = undefined;
        revision = message.revision;
        authoritative = message.strokes;
        publish();
      }
      if (message.type === 'penboard.stroke') {
        const acknowledged = message.requestId
          ? pending.delete(message.requestId)
          : false;
        if (message.revision > revision + 1) {
          readRoom();
        } else if (message.revision === revision + 1) {
          revision = message.revision;
          authoritative = [...authoritative, message.stroke];
          publish();
          return;
        }
        if (acknowledged) publish();
      }
      if (message.type === 'error' && message.requestId) {
        if (readRequest === message.requestId) readRequest = undefined;
        if (pending.delete(message.requestId)) publish();
      }
    },
    append(stroke: WhiteboardStroke) {
      if (!send || !selfId || pending.has(stroke.id)) return;
      const parsed = penboardStrokeSchema.safeParse({
        ...stroke,
        authorId: selfId,
      });
      if (!parsed.success) return;
      // Correlate the canonical server ID with the optimistic local stroke.
      if (
        send({
          type: 'penboard.draw',
          stroke: parsed.data,
          requestId: stroke.id,
        }) &&
        pending.size < MAX_PENDING_STROKES
      ) {
        pending.set(stroke.id, parsed.data);
        publish();
      }
    },
    undo() {
      send?.({ type: 'penboard.undo' });
    },
    clear() {
      send?.({ type: 'penboard.clear' });
    },
    close() {
      send = undefined;
      readRequest = undefined;
      selfId = undefined;
      manager = false;
      revision = 0;
      authoritative = EMPTY.strokes;
      pending.clear();
      if (snapshot.strokes.length) publish();
      return listeners.size === 0;
    },
  };
}

const stores = new Map<string, ReturnType<typeof createWhiteboardStore>>();
export function whiteboardRoom(meetingId: string) {
  let store = stores.get(meetingId);
  if (!store) {
    store = createWhiteboardStore();
    stores.set(meetingId, store);
  }
  return store;
}

export function closeWhiteboardRoom(meetingId: string) {
  if (stores.get(meetingId)?.close()) stores.delete(meetingId);
}

export function readWhiteboard(meetingId: string): WhiteboardSnapshot {
  return whiteboardRoom(meetingId).read();
}

export function subscribeWhiteboard(meetingId: string, listener: () => void) {
  return whiteboardRoom(meetingId).subscribe(listener);
}

export function appendWhiteboardStroke(
  meetingId: string,
  stroke: WhiteboardStroke
) {
  whiteboardRoom(meetingId).append(stroke);
}

export function undoWhiteboardStroke(meetingId: string, _authorId: string) {
  whiteboardRoom(meetingId).undo();
}

export function clearWhiteboard(meetingId: string) {
  whiteboardRoom(meetingId).clear();
}
