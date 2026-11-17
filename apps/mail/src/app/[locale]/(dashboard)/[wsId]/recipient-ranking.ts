import type { MailCorrespondent } from '@tuturuuu/internal-api';
import type { WorkspacePerson } from '@tuturuuu/internal-api/people';
import { foldedMatchQuality } from '@/lib/mail/search-fold';
import { parseRecipientInput } from './recipient-utils';

export const MAX_RECIPIENT_SUGGESTIONS = 6;

export type RecipientSuggestion = {
  key: string;
  kind: 'member' | 'contact' | 'recent';
  /** Null when the workspace hides the member's email; such rows are disabled. */
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  lastAt: string | null;
  score: number;
  quality: number;
};

const KIND_RANK = { member: 0, contact: 1, recent: 2 } as const;
const EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u;

function matchQuality(
  query: string,
  email: string | null,
  name: string | null
) {
  if (!query.trim()) return 1;
  return Math.max(
    foldedMatchQuality(email, query),
    foldedMatchQuality(name, query)
  );
}

/**
 * Merges workspace people and recent correspondents into one ranked list.
 * Rows are deduplicated by lowercase email and keep the strongest kind
 * (member, then contact, then recent) while inheriting the recent score.
 * Order: match quality, then recency score, then kind.
 */
export function mergeRecipientSuggestions({
  recent,
  people,
  query,
  excludedAddresses,
  limit = MAX_RECIPIENT_SUGGESTIONS,
}: {
  recent: readonly MailCorrespondent[];
  people: readonly WorkspacePerson[];
  query: string;
  excludedAddresses: readonly string[];
  limit?: number;
}): RecipientSuggestion[] {
  const excluded = new Set(excludedAddresses.map((v) => v.toLowerCase()));
  const rows = new Map<string, RecipientSuggestion>();

  for (const row of recent) {
    const email = row.email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(email) || excluded.has(email)) continue;
    rows.set(email, {
      key: `recent:${email}`,
      kind: 'recent',
      email,
      name: row.name,
      avatarUrl: null,
      lastAt: row.lastAt,
      score: row.score,
      quality: matchQuality(query, email, row.name),
    });
  }

  for (const person of people) {
    const raw = person.email?.trim().toLowerCase() || null;
    const email = raw && EMAIL_PATTERN.test(raw) ? raw : null;
    if (email && excluded.has(email)) continue;
    if (!email && !person.displayName) continue;
    const mapKey = email ?? `${person.kind}:${person.id}`;
    const existing = rows.get(mapKey);
    if (
      existing &&
      KIND_RANK[existing.kind] <=
        KIND_RANK[person.kind as keyof typeof KIND_RANK]
    )
      continue;
    rows.set(mapKey, {
      key: `${person.kind}:${person.id}`,
      kind: person.kind,
      email,
      name: person.displayName || existing?.name || null,
      avatarUrl: person.avatarUrl,
      lastAt: existing?.lastAt ?? null,
      score: existing?.score ?? 0,
      // The people API matched this person, possibly on fields not shown here.
      quality: Math.max(1, matchQuality(query, email, person.displayName)),
    });
  }

  return [...rows.values()]
    .filter((row) => row.quality > 0)
    .sort(
      (a, b) =>
        b.quality - a.quality ||
        b.score - a.score ||
        KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
        Number(Boolean(b.email)) - Number(Boolean(a.email)) ||
        (a.name ?? a.email ?? '').localeCompare(b.name ?? b.email ?? '')
    )
    .slice(0, limit);
}

/**
 * The single address typed in the field, when it is valid and not already
 * listed; null for partial text or a multi-address paste.
 */
export function typedAddressOption(
  input: string,
  suggestions: readonly RecipientSuggestion[]
) {
  const parsed = parseRecipientInput(input);
  if (parsed.length !== 1 || !parsed[0]!.valid) return null;
  const { address, displayName } = parsed[0]!;
  if (suggestions.some((row) => row.email === address)) return null;
  return { address, displayName };
}

/** True when the input holds a separator, so suggestions do not apply. */
export function isMultiAddressInput(input: string) {
  return /[,;<\n]/u.test(input);
}

export type RecipientKeyAction = 'pick' | 'wait' | 'pass';

/**
 * What Enter or Tab does with the highlighted option. An empty field picks
 * only after the user has moved through the list, so a stray Enter adds no
 * one. Suggestions still showing the previous query's results are not picked
 * until the current query settles; the typed-address option is always current.
 */
export function recipientKeyAction({
  key,
  input,
  navigated,
  optionType,
  stale,
}: {
  key: 'Enter' | 'Tab';
  input: string;
  navigated: boolean;
  optionType: 'address' | 'suggestion';
  stale: boolean;
}): RecipientKeyAction {
  if (!input.trim() && (key === 'Tab' || !navigated)) return 'pass';
  if (optionType === 'suggestion' && stale && !navigated) return 'wait';
  return 'pick';
}
