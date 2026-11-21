/**
 * The key observation port and the minting-time rule built on it. A row
 * records when the signer first saw a key published everywhere, stamped by
 * the store's own clock; the configured `publishedAt` is never used here.
 */
import type { TokenClass } from '../token-core';
import { isEmergencyArmed, type EmergencyKids } from './emergency';
import type { ParsedKeyEntry } from './key-set';

export const PUBLICATION_DELAY_SECONDS = 604_800;

export type ObservedKey = Readonly<{
  class: TokenClass;
  kid: string;
  thumbprint: string;
}>;

export type KeyObservation = ObservedKey &
  Readonly<{
    /** Seconds, from the store's clock when the row was inserted. */
    publishedAt: number;
    /** Whether this row was the first row of its class. */
    bootstrap: boolean;
  }>;

/**
 * Insert-only store of key observations. `getOrCreate` returns the committed
 * row for `(class, kid, thumbprint)`, inserting it with the store's own time
 * if it does not exist. In the same transaction, the first row ever inserted
 * for a class is marked as that class's bootstrap key. A `kid` with another
 * thumbprint is another key with its own row. The store never updates or
 * deletes a row, and no caller supplies `publishedAt`.
 */
export interface KeyObservationStore {
  getOrCreate(key: ObservedKey): Promise<KeyObservation | 'unavailable'>;
}

/** Committed rows the signer has cached, keyed by `observationKey`. */
export type ObservationCache = ReadonlyMap<string, KeyObservation>;

export const EMPTY_OBSERVATIONS: ObservationCache = new Map();

export function observationKey(key: ObservedKey): string {
  return `${key.class}|${key.kid}|${key.thumbprint}`;
}

/** The committed row for an entry, or null when none is cached. */
export function observationFor(
  entry: ParsedKeyEntry,
  observations: ObservationCache | null | undefined
): KeyObservation | null {
  const row = observations?.get(observationKey(entry));
  if (
    !row ||
    row.class !== entry.class ||
    row.kid !== entry.kid ||
    row.thumbprint !== entry.thumbprint ||
    !Number.isSafeInteger(row.publishedAt) ||
    row.publishedAt < 0
  ) {
    return null;
  }
  return row;
}

/**
 * The earliest second `entry` may sign, or null without a committed row:
 * `max(notBefore, publishedAt + 7 days)`, where the class's bootstrap key and
 * an armed emergency `active` key skip only the 7 days.
 */
export function mintableAt(
  entry: ParsedKeyEntry,
  input: {
    observations: ObservationCache | null | undefined;
    emergencyKids?: EmergencyKids | null;
  }
): number | null {
  const row = observationFor(entry, input.observations);
  if (!row) return null;
  if (row.bootstrap === true || isEmergencyArmed(entry, input.emergencyKids)) {
    return entry.notBefore;
  }
  return Math.max(entry.notBefore, row.publishedAt + PUBLICATION_DELAY_SECONDS);
}
