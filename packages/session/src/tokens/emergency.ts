/**
 * `TTR_TOKEN_EMERGENCY_KIDS`: at most one armed `kid` per class, read only by
 * the signer. An armed key skips only the 7-day publication wait.
 */
import { isJsonObject, parseStrictJson } from '../encoding';
import { isTokenClass, KID_PATTERN, type TokenClass } from '../token-core';
import type { ParsedKeyEntry } from './key-set';

export type EmergencyListing = Readonly<{ class: TokenClass; kid: string }>;

/** The first well-formed listing of each class; later listings are ignored. */
export type EmergencyKids = Readonly<{
  armed: Readonly<Partial<Record<TokenClass, string>>>;
  ignored: number;
}>;

export const NO_EMERGENCY_KIDS: EmergencyKids = Object.freeze({
  armed: Object.freeze({}),
  ignored: 0,
});

/**
 * Parses a JSON array of `{ "class": ..., "kid": ... }` listings. A listing
 * that is malformed, or a second one for its class, is ignored alone. A
 * missing or unparseable list arms nothing.
 */
export function parseEmergencyKids(
  json: string | null | undefined
): EmergencyKids {
  if (typeof json !== 'string' || json.trim() === '') return NO_EMERGENCY_KIDS;
  const value = parseStrictJson(json);
  if (!Array.isArray(value)) return NO_EMERGENCY_KIDS;
  const armed: Partial<Record<TokenClass, string>> = {};
  let ignored = 0;
  for (const listing of value) {
    const valid =
      isJsonObject(listing) &&
      Object.keys(listing).length === 2 &&
      isTokenClass(listing.class) &&
      typeof listing.kid === 'string' &&
      KID_PATTERN.test(listing.kid);
    if (!valid || armed[listing.class as TokenClass] !== undefined) {
      ignored += 1;
      continue;
    }
    armed[listing.class as TokenClass] = listing.kid as string;
  }
  return Object.freeze({ armed: Object.freeze(armed), ignored });
}

/**
 * Whether the emergency list arms `entry`: it must be the listing of its own
 * class and the class's `active` key. An unknown, `next`, retired or
 * wrong-class listing arms nothing. The caller checks the signing window.
 */
export function isEmergencyArmed(
  entry: ParsedKeyEntry,
  emergencyKids: EmergencyKids | null | undefined
): boolean {
  return (
    entry.status === 'active' &&
    emergencyKids?.armed?.[entry.class] === entry.kid
  );
}
