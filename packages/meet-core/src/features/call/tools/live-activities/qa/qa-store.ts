export type LiveQaAnswer = {
  id: string;
  participantId: string;
  text: string;
};

export type LiveQaSnapshot = {
  open: boolean;
  question: string | null;
  answers: readonly LiveQaAnswer[];
};

type Store = {
  snapshot: LiveQaSnapshot;
  listeners: Set<() => void>;
};

const DEFAULT_SNAPSHOT: LiveQaSnapshot = {
  open: false,
  question: null,
  answers: [],
};

const stores = new Map<string, Store>();

function roomStore(meetingId: string): Store {
  const existing = stores.get(meetingId);
  if (existing) return existing;
  const created: Store = {
    snapshot: { ...DEFAULT_SNAPSHOT, answers: [] },
    listeners: new Set(),
  };
  stores.set(meetingId, created);
  return created;
}

function publish(meetingId: string) {
  const store = roomStore(meetingId);
  for (const listener of store.listeners) listener();
}

export function readLiveQa(meetingId: string): LiveQaSnapshot {
  return roomStore(meetingId).snapshot;
}

export function subscribeLiveQa(meetingId: string, listener: () => void) {
  const store = roomStore(meetingId);
  store.listeners.add(listener);
  return () => store.listeners.delete(listener);
}

export function resetLiveQa(meetingId: string) {
  const store = roomStore(meetingId);
  store.snapshot = { ...DEFAULT_SNAPSHOT, answers: [] };
  publish(meetingId);
}

export function openLiveQa(meetingId: string) {
  const store = roomStore(meetingId);
  store.snapshot = { ...store.snapshot, open: true };
  publish(meetingId);
}

export function closeLiveQa(meetingId: string) {
  const store = roomStore(meetingId);
  store.snapshot = { open: false, question: null, answers: [] };
  publish(meetingId);
}

export function askLiveQaQuestion(meetingId: string, question: string) {
  const trimmed = question.trim();
  if (!trimmed) return;
  const store = roomStore(meetingId);
  store.snapshot = {
    ...store.snapshot,
    open: true,
    question: trimmed,
    answers: [],
  };
  publish(meetingId);
}

export function submitLiveQaAnswer(
  meetingId: string,
  participantId: string,
  text: string
) {
  const trimmed = text.trim();
  const store = roomStore(meetingId);
  if (!store.snapshot.open || !store.snapshot.question || !trimmed) return;
  const id = `${participantId}:${store.snapshot.answers.length}`;
  store.snapshot = {
    ...store.snapshot,
    answers: [
      ...store.snapshot.answers,
      { id, participantId, text: trimmed },
    ],
  };
  publish(meetingId);
}