import type { WhiteboardStroke } from './stroke';

export type WhiteboardSnapshot = {
  strokes: readonly WhiteboardStroke[];
};

type Store = {
  snapshot: WhiteboardSnapshot;
  listeners: Set<() => void>;
};

const stores = new Map<string, Store>();

function boardStore(meetingId: string): Store {
  const existing = stores.get(meetingId);
  if (existing) return existing;
  const created: Store = { snapshot: { strokes: [] }, listeners: new Set() };
  stores.set(meetingId, created);
  return created;
}

function publish(store: Store, strokes: readonly WhiteboardStroke[]) {
  store.snapshot = { strokes };
  for (const listener of store.listeners) listener();
}

export function readWhiteboard(meetingId: string): WhiteboardSnapshot {
  return boardStore(meetingId).snapshot;
}

export function subscribeWhiteboard(meetingId: string, listener: () => void) {
  const store = boardStore(meetingId);
  store.listeners.add(listener);
  return () => {
    store.listeners.delete(listener);
  };
}

/**
 * Adds a stroke from any participant. A stroke already on the board is left as
 * it is, so a repeated delivery cannot duplicate it.
 */
export function appendWhiteboardStroke(
  meetingId: string,
  stroke: WhiteboardStroke
) {
  const store = boardStore(meetingId);
  const { strokes } = store.snapshot;
  if (stroke.points.length === 0) return;
  if (strokes.some((existing) => existing.id === stroke.id)) return;
  publish(store, [...strokes, stroke]);
}

/** Removes the author's latest stroke and leaves everyone else's in place. */
export function undoWhiteboardStroke(meetingId: string, authorId: string) {
  const store = boardStore(meetingId);
  const { strokes } = store.snapshot;
  const index = strokes.findLastIndex((stroke) => stroke.authorId === authorId);
  if (index < 0) return;
  publish(
    store,
    strokes.filter((_, position) => position !== index)
  );
}

export function clearWhiteboard(meetingId: string) {
  const store = boardStore(meetingId);
  if (store.snapshot.strokes.length > 0) publish(store, []);
}
