/**
 * Pure display rules for the sessions list, shared with the mobile app's
 * `session_presentation.dart`: CIDR-free and masked addresses, and grouping
 * into this device, recently active and older sessions. Callers pass `now`
 * so every rule is deterministic under test.
 */

/** Sessions active within this window count as recent. */
export const RECENT_SESSION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** The address without a CIDR suffix ("1.2.3.4/32" → "1.2.3.4"). */
export function sessionIpAddress(raw: string | null | undefined) {
  const value = raw?.trim() ?? '';
  if (value.length === 0 || value === 'Unknown') return null;
  const address = value.replace(/\/\d{1,3}$/u, '');
  return address.length === 0 ? null : address;
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/u;
const IPV6_GROUP = /^[0-9a-f]{1,4}$/iu;

/**
 * The eight groups of an IPv6 address with `::` expanded to zero groups and
 * an embedded IPv4 suffix counted as two groups. Null when the value is not
 * IPv6. Expanding first keeps host bits out of the network prefix:
 * `2001::beef` starts with `2001:0`, not `2001:beef`.
 */
function ipv6Groups(address: string) {
  const halves = address.split('::');
  if (halves.length > 2) return null;
  const parts = (half: string) => (half.length === 0 ? [] : half.split(':'));
  const head = parts(halves[0] ?? '');
  const tail = halves.length === 2 ? parts(halves[1] ?? '') : [];
  const last = tail.length > 0 ? tail : head;
  const suffix = last.at(-1);
  if (suffix?.includes('.')) {
    if (!IPV4.test(suffix)) return null;
    last.splice(-1, 1, '0', '0');
  }
  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const groups = [...head, ...Array<string>(missing).fill('0'), ...tail];
  return groups.every((group) => IPV6_GROUP.test(group)) ? groups : null;
}

/**
 * A shortened address for lists: the first two IPv4 octets or IPv6 groups.
 * IPv4-mapped IPv6 addresses are shown as IPv4. Never includes a prefix
 * length; unrecognised values are hidden rather than shown raw.
 */
export function maskSessionIp(raw: string | null | undefined) {
  let address = sessionIpAddress(raw)?.split('%')[0] ?? '';
  if (address.length === 0) return null;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/iu.exec(address);
  if (mapped?.[1]) address = mapped[1];
  const v4 = IPV4.exec(address);
  if (v4) return `${v4[1]}.${v4[2]}.x.x`;
  if (!address.includes(':')) return null;
  const groups = ipv6Groups(address);
  if (groups === null) return null;
  const prefix = groups
    .slice(0, 2)
    .map((group) => Number.parseInt(group, 16).toString(16));
  return `${prefix.join(':')}:…`;
}

export interface SessionGroups<T> {
  current: T | null;
  recent: T[];
  older: T[];
}

function time(value: Date | null) {
  if (value === null) return null;
  const ms = value.getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Groups sessions newest first. The first current session is "This device";
 * another session counts as recent when it was active within `recentWindowMs`.
 * Sessions without a valid last-active time sort last, among the older ones.
 */
export function groupSessions<T>(
  sessions: Iterable<T>,
  options: {
    isCurrent: (session: T) => boolean;
    lastActive: (session: T) => Date | null;
    now: Date;
    recentWindowMs?: number;
  }
): SessionGroups<T> {
  const window = options.recentWindowMs ?? RECENT_SESSION_WINDOW_MS;
  let current: T | null = null;
  const others: { session: T; at: number | null }[] = [];
  for (const session of sessions) {
    if (current === null && options.isCurrent(session)) {
      current = session;
    } else {
      others.push({ session, at: time(options.lastActive(session)) });
    }
  }
  others.sort((a, b) => {
    if (a.at === null && b.at === null) return 0;
    if (a.at === null) return 1;
    if (b.at === null) return -1;
    return b.at - a.at;
  });
  const now = options.now.getTime();
  const recent: T[] = [];
  const older: T[] = [];
  for (const { session, at } of others) {
    if (at !== null && now - at <= window) {
      recent.push(session);
    } else {
      older.push(session);
    }
  }
  return { current, recent, older };
}

export interface SessionIdentityPart {
  id: string;
  label: string;
  context: string | null;
}

export interface SessionDisambiguation {
  duplicated: boolean;
  context: string | null;
  ordinal: number | null;
}

/**
 * Marks duplicate client labels so screen-reader controls and confirmation
 * dialogs distinguish sessions using visible row context, with an ordinal
 * fallback when two sessions share both label and context.
 */
export function disambiguateSessionIdentifiers(
  items: readonly SessionIdentityPart[]
): Map<string, SessionDisambiguation> {
  const labelCounts = new Map<string, number>();
  const pairCounts = new Map<string, number>();
  for (const item of items) {
    labelCounts.set(item.label, (labelCounts.get(item.label) ?? 0) + 1);
    const pairKey = `${item.label}\0${item.context ?? ''}`;
    pairCounts.set(pairKey, (pairCounts.get(pairKey) ?? 0) + 1);
  }
  const pairSeen = new Map<string, number>();
  const result = new Map<string, SessionDisambiguation>();
  for (const item of items) {
    if ((labelCounts.get(item.label) ?? 0) <= 1) {
      result.set(item.id, { duplicated: false, context: null, ordinal: null });
      continue;
    }
    const pairKey = `${item.label}\0${item.context ?? ''}`;
    const hasTie = (pairCounts.get(pairKey) ?? 0) > 1;
    const ordinal = hasTie ? (pairSeen.get(pairKey) ?? 0) + 1 : null;
    if (ordinal !== null) pairSeen.set(pairKey, ordinal);
    result.set(item.id, {
      duplicated: true,
      context: item.context,
      ordinal,
    });
  }
  return result;
}
