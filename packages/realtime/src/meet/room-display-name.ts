import type { MeetRealtimeTokenPayload } from './primitives';

/**
 * Normalises user-supplied display-name text: strips control/format
 * characters (incl. bidi), collapses every run of separator or whitespace
 * characters (\p{Z}, U+2028/2029, U+3000, tabs) to one space, then trims.
 * Padding can therefore never inflate a truncated name.
 */
export function normalizeDisplayNameText(value: string): string {
  return value
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/[\p{Z}\s]+/gu, ' ')
    .trim();
}

/**
 * Rooms written before #8459 baked a literal " (guest)" into every lobby
 * entrant's name. Identity is now carried by the structured `guest` and
 * `external` flags, so the legacy suffix is removed wherever a stored name is
 * reused or rendered.
 */
const LEGACY_GUEST_SUFFIX = ' (guest)';

export function stripLegacyGuestSuffix(value: string): string {
  return value.endsWith(LEGACY_GUEST_SUFFIX)
    ? value.slice(0, -LEGACY_GUEST_SUFFIX.length).trimEnd() || value
    : value;
}

/**
 * The name a lobby entrant chose, normalised and capped at 120 characters.
 * Anonymous guests and signed-in people from outside the workspace are told
 * apart by the server-set `guest` / `external` flags, never by name text, so a
 * self-chosen name cannot hide or forge the marker.
 */
export function lobbyDisplayName(value: string): string {
  const clean = stripLegacyGuestSuffix(normalizeDisplayNameText(value));
  let name = '';
  for (const character of clean || 'Participant') {
    if (name.length + character.length > 120) break;
    name += character;
  }
  return name.trimEnd();
}

/**
 * A signed-in account outside the meeting's workspace: it joins through the
 * lobby without the anonymous guest flag. Labelling only; permissions do not
 * read this.
 */
export function isMeetExternalParticipant(
  token: Pick<MeetRealtimeTokenPayload, 'admission' | 'guest' | 'role'>
) {
  return !token.guest && token.role !== 'host' && token.admission === 'lobby';
}

interface LegacyMarkerEntry {
  displayName: string;
  external?: true;
  guest?: true;
  userId: string;
}

function upgradeEntry<T extends LegacyMarkerEntry>(
  entry: T,
  guestIds: ReadonlySet<string>
): T {
  const name = stripLegacyGuestSuffix(entry.displayName);
  if (name === entry.displayName) return entry;
  // Every pre-#8459 lobby entrant carried the suffix: entries without the
  // anonymous guest flag were signed-in accounts from outside the workspace.
  const guest = entry.guest === true || guestIds.has(entry.userId);
  return {
    ...entry,
    displayName: name,
    ...(guest ? { guest: true as const } : {}),
    ...(guest || entry.external ? {} : { external: true as const }),
  };
}

function upgradeRecord<T extends LegacyMarkerEntry>(
  record: Record<string, T> | undefined,
  guestIds: ReadonlySet<string>
) {
  if (!record) return record;
  let changed = false;
  const next: Record<string, T> = {};
  for (const [key, entry] of Object.entries(record)) {
    next[key] = upgradeEntry(entry, guestIds);
    if (next[key] !== entry) changed = true;
  }
  return changed ? next : record;
}

/**
 * Restored rooms written before #8459 store names with a baked " (guest)"
 * suffix and no `external` flag. Moves that marker into the structured flags
 * so no outside account or guest loses it when the suffix disappears. Returns
 * the same object when nothing needed upgrading.
 */
export function upgradeLegacyGuestMarkers<
  T extends {
    approved?: Record<string, LegacyMarkerEntry>;
    chat?: LegacyMarkerEntry[];
    presence: Record<string, LegacyMarkerEntry>;
    waiting: Record<string, LegacyMarkerEntry>;
  },
>(state: T): T {
  const guestIds = new Set(
    [...Object.values(state.presence), ...Object.values(state.waiting)]
      .filter((entry) => entry.guest)
      .map((entry) => entry.userId)
  );
  const presence = upgradeRecord(state.presence, guestIds);
  const waiting = upgradeRecord(state.waiting, guestIds);
  const approved = upgradeRecord(state.approved, guestIds);
  const chat = state.chat?.map((entry) => upgradeEntry(entry, guestIds));
  const chatChanged = chat?.some(
    (entry, index) => entry !== state.chat?.[index]
  );
  if (
    presence === state.presence &&
    waiting === state.waiting &&
    approved === state.approved &&
    !chatChanged
  )
    return state;
  return {
    ...state,
    presence,
    waiting,
    ...(approved ? { approved } : {}),
    ...(chatChanged ? { chat } : {}),
  } as T;
}
