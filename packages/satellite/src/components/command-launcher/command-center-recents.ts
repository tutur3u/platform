/**
 * Recently opened launcher results, kept in this browser per signed-in actor
 * (or one anonymous bucket). Entries are identifiers only; the Recent section
 * shows an entry only when the same app, page or workspace is in the host's
 * current, permission-filtered results, so a stale entry never grants or
 * reveals anything. Storage failures (private mode, blocked site data) leave
 * the section empty.
 */
export type CommandCenterRecent =
  | { at: number; id: string; kind: 'app' }
  | { at: number; id: string; kind: 'navigation' }
  | { at: number; id: string; kind: 'workspace' };

const STORAGE_PREFIX = 'tuturuuu:command-center:recent:';
const MAX_RECENTS = 12;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function storageKey(actorId: string | null | undefined) {
  return `${STORAGE_PREFIX}${actorId ?? 'anonymous'}`;
}

function isRecent(value: unknown): value is CommandCenterRecent {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return (
    (entry.kind === 'app' ||
      entry.kind === 'navigation' ||
      entry.kind === 'workspace') &&
    typeof entry.id === 'string' &&
    typeof entry.at === 'number'
  );
}

export function readCommandCenterRecents(
  actorId: string | null | undefined,
  now = Date.now()
): CommandCenterRecent[] {
  try {
    const raw = window.localStorage.getItem(storageKey(actorId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isRecent)
      .filter((entry) => now - entry.at <= MAX_AGE_MS)
      .slice(0, MAX_RECENTS);
  } catch {
    return [];
  }
}

export function recordCommandCenterRecent(
  actorId: string | null | undefined,
  entry: Omit<CommandCenterRecent, 'at'>,
  now = Date.now()
) {
  try {
    const next = [
      { ...entry, at: now } as CommandCenterRecent,
      ...readCommandCenterRecents(actorId, now).filter(
        (existing) => existing.kind !== entry.kind || existing.id !== entry.id
      ),
    ].slice(0, MAX_RECENTS);
    window.localStorage.setItem(storageKey(actorId), JSON.stringify(next));
  } catch {
    // Recents are a convenience; storage errors are not surfaced.
  }
}
