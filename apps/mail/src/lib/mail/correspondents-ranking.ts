import { foldedMatchQuality } from './search-fold';

export const CORRESPONDENT_WINDOW_DAYS = 180;
export const CORRESPONDENT_DECAY_DAYS = 30;
export const CORRESPONDENT_OUTBOUND_WEIGHT = 2;
export const CORRESPONDENT_MAX_LIMIT = 20;
export const CORRESPONDENT_MAX_QUERY_LENGTH = 100;

const DAY_MS = 24 * 60 * 60 * 1000;

export type CorrespondentDirection = 'inbound' | 'outbound';

/** One address seen on one message of the mailbox. */
export type CorrespondentEvent = {
  email: string;
  name: string | null;
  at: string;
  direction: CorrespondentDirection;
};

export type RankedCorrespondent = {
  email: string;
  name: string | null;
  score: number;
  lastAt: string;
  direction: CorrespondentDirection;
};

/** Weight of one message: exp(-age/30 days), doubled for mail the mailbox sent. */
export function correspondentEventWeight(
  event: Pick<CorrespondentEvent, 'at' | 'direction'>,
  now: number
) {
  const ageDays = Math.max(0, now - Date.parse(event.at)) / DAY_MS;
  const weight = Math.exp(-ageDays / CORRESPONDENT_DECAY_DAYS);
  return event.direction === 'outbound'
    ? weight * CORRESPONDENT_OUTBOUND_WEIGHT
    : weight;
}

/** Clamps the requested limit to 1..20, defaulting to 8. */
export function clampCorrespondentLimit(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 8;
  return Math.min(CORRESPONDENT_MAX_LIMIT, Math.max(1, Math.trunc(parsed)));
}

/**
 * Aggregates per-message events into one row per lowercase address, keeps
 * rows matching `query` (accent-insensitive, on address or name) and orders
 * them by match quality, then score, then recency.
 */
export function rankCorrespondents(
  events: readonly CorrespondentEvent[],
  {
    now,
    query = '',
    limit,
    excludedAddresses = [],
  }: {
    now: number;
    query?: string;
    limit: number;
    excludedAddresses?: readonly string[];
  }
): RankedCorrespondent[] {
  const excluded = new Set(excludedAddresses.map((v) => v.toLowerCase()));
  const windowStart = now - CORRESPONDENT_WINDOW_DAYS * DAY_MS;
  const rows = new Map<
    string,
    RankedCorrespondent & { nameAt: number; lastMs: number }
  >();

  for (const event of events) {
    const email = event.email.trim().toLowerCase();
    const at = Date.parse(event.at);
    if (!email.includes('@') || excluded.has(email)) continue;
    if (!Number.isFinite(at) || at < windowStart) continue;
    const name = event.name?.trim() || null;
    const weight = correspondentEventWeight(event, now);
    const row = rows.get(email);
    if (!row) {
      rows.set(email, {
        email,
        name,
        score: weight,
        lastAt: new Date(at).toISOString(),
        lastMs: at,
        nameAt: name ? at : -1,
        direction: event.direction,
      });
      continue;
    }
    row.score += weight;
    if (at > row.lastMs) {
      row.lastMs = at;
      row.lastAt = new Date(at).toISOString();
      row.direction = event.direction;
    }
    if (name && at > row.nameAt) {
      row.name = name;
      row.nameAt = at;
    }
  }

  const needle = query.trim().slice(0, CORRESPONDENT_MAX_QUERY_LENGTH);
  return [...rows.values()]
    .map((row) => ({
      row,
      quality: needle
        ? Math.max(
            foldedMatchQuality(row.email, needle),
            foldedMatchQuality(row.name, needle)
          )
        : 1,
    }))
    .filter(({ quality }) => quality > 0)
    .sort(
      (a, b) =>
        b.quality - a.quality ||
        b.row.score - a.row.score ||
        b.row.lastMs - a.row.lastMs
    )
    .slice(0, limit)
    .map(({ row }) => ({
      email: row.email,
      name: row.name,
      score: Math.round(row.score * 10_000) / 10_000,
      lastAt: row.lastAt,
      direction: row.direction,
    }));
}
