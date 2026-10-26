/**
 * Resolves schedule names against data the import page already loaded: the
 * workspace user list (teacher in charge) and topic announcement contacts
 * (foreign teacher). The server only validates the resulting ids.
 */
import { stripDiacritics } from './teacher-schedule-parser';

export interface MatchableWorkspaceUser {
  archived?: boolean | null;
  display_name: string | null;
  email: string | null;
  full_name: string | null;
  id: string;
}

export interface MatchableContact {
  archived: boolean;
  email: string;
  name: string;
}

export type NameMatch<T> =
  | { kind: 'matched'; value: T }
  | { kind: 'ambiguous' }
  | { kind: 'unmatched' };

export function normalizePersonName(value: string) {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9@._+-]+/gu, ' ')
    .trim();
}

function exactKey(value: string) {
  return value.trim().replace(/\s+/gu, ' ').toLowerCase();
}

function uniqueBy<T>(items: T[], key: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const id = key(item);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/**
 * Exact (case-insensitive) matches win; otherwise diacritic-insensitive
 * matches are used. More than one candidate is ambiguous, never a guess.
 */
function matchByLabels<T>(
  query: string,
  candidates: T[],
  labels: (candidate: T) => (string | null | undefined)[],
  identity: (candidate: T) => string
): NameMatch<T> {
  const exact = exactKey(query);
  const normalized = normalizePersonName(query);
  if (!normalized) return { kind: 'unmatched' };

  const pick = (matches: T[]): NameMatch<T> | null => {
    const unique = uniqueBy(matches, identity);
    if (unique.length === 1 && unique[0]) {
      return { kind: 'matched', value: unique[0] };
    }
    return unique.length > 1 ? { kind: 'ambiguous' } : null;
  };

  const exactMatches = candidates.filter((candidate) =>
    labels(candidate).some((label) => label && exactKey(label) === exact)
  );
  const exactResult = pick(exactMatches);
  if (exactResult) return exactResult;

  const looseMatches = candidates.filter((candidate) =>
    labels(candidate).some(
      (label) => label && normalizePersonName(label) === normalized
    )
  );
  return pick(looseMatches) ?? { kind: 'unmatched' };
}

export function matchWorkspaceUser(
  name: string,
  users: MatchableWorkspaceUser[]
): NameMatch<MatchableWorkspaceUser> {
  return matchByLabels(
    name,
    users.filter((user) => !user.archived),
    (user) => [user.full_name, user.display_name, user.email],
    (user) => user.id
  );
}

export function matchContactByName(
  name: string,
  contacts: MatchableContact[]
): NameMatch<MatchableContact> {
  return matchByLabels(
    name,
    contacts.filter((contact) => !contact.archived),
    (contact) => [contact.name, contact.email],
    (contact) => contact.email.toLowerCase()
  );
}
