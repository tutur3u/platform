const PREFIX = 'meet-ended-v1:';
const MAX_AGE = 30 * 24 * 60 * 60 * 1000;
const MAX_ROOMS = 256;
export const ENDED_ROOM_EVENT = 'meet-ended-room-updated';

/** Only a terminal-state hint: never cache names, transcripts or permissions. */
function read(accountId: string): Record<string, number> {
  if (!accountId || typeof window === 'undefined') return {};
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(PREFIX + accountId) ?? '{}'
    );
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const now = Date.now();
    return Object.fromEntries(
      Object.entries(value).filter(
        ([id, time]) =>
          /^[a-zA-Z0-9-]{1,64}$/.test(id) &&
          typeof time === 'number' &&
          time <= now &&
          time > now - MAX_AGE
      )
    );
  } catch {
    return {};
  }
}

export function isKnownEndedRoom(accountId: string, meetingId: string) {
  return Object.hasOwn(read(accountId), meetingId);
}

export function rememberEndedRoom(accountId: string, meetingId: string) {
  if (
    !accountId ||
    !/^[a-zA-Z0-9-]{1,64}$/.test(meetingId) ||
    typeof window === 'undefined'
  )
    return;
  try {
    const records = read(accountId);
    if (Object.hasOwn(records, meetingId)) return;
    records[meetingId] = Date.now();
    const latest = Object.fromEntries(
      Object.entries(records)
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_ROOMS)
    );
    localStorage.setItem(PREFIX + accountId, JSON.stringify(latest));
    window.dispatchEvent(
      new CustomEvent(ENDED_ROOM_EVENT, { detail: accountId })
    );
  } catch {
    /* Storage restrictions must never prevent joining or leaving. */
  }
}

export function subscribeEndedRooms(accountId: string, notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    let storage: Storage;
    try {
      storage = window.localStorage;
    } catch {
      return;
    }
    if (
      event.storageArea === storage &&
      (event.key === null ||
        (event.key === PREFIX + accountId && event.oldValue !== event.newValue))
    )
      notify();
  };
  const onLocal = (event: Event) => {
    if ((event as CustomEvent<string>).detail === accountId) notify();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(ENDED_ROOM_EVENT, onLocal);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(ENDED_ROOM_EVENT, onLocal);
  };
}
