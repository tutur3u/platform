/**
 * `TTR_TOKEN_EMERGENCY_KIDS`: at most one armed `kid` per class, read only by
 * the signer. An armed key skips only the 7-day publication wait.
 */
import { isJsonObject, parseStrictJson } from '../encoding';
import { isTokenClass, KID_PATTERN, type TokenClass } from '../token-core';
import type { ParsedKeyEntry } from './key-set';

export type EmergencyListing = Readonly<{ class: TokenClass; kid: string }>;

/**
 * The well-formed listings of each class. Only a listing that names its
 * class's `active` key arms anything, so a listing for an unknown, `next` or
 * retired key never takes the slot from the real active key.
 */
export type EmergencyKids = Readonly<{
  armed: Readonly<Partial<Record<TokenClass, readonly string[]>>>;
  ignored: number;
}>;

export const NO_EMERGENCY_KIDS: EmergencyKids = Object.freeze({
  armed: Object.freeze({}),
  ignored: 0,
});

/**
 * Parses a JSON array of `{ "class": ..., "kid": ... }` listings. A malformed
 * listing is ignored alone. A missing or unparseable list arms nothing.
 */
export function parseEmergencyKids(
  json: string | null | undefined
): EmergencyKids {
  if (typeof json !== 'string' || json.trim() === '') return NO_EMERGENCY_KIDS;
  const value = parseStrictJson(json);
  if (!Array.isArray(value)) return NO_EMERGENCY_KIDS;
  const armed: Partial<Record<TokenClass, string[]>> = {};
  let ignored = 0;
  for (const listing of value) {
    const valid =
      isJsonObject(listing) &&
      Object.keys(listing).length === 2 &&
      isTokenClass(listing.class) &&
      typeof listing.kid === 'string' &&
      KID_PATTERN.test(listing.kid);
    if (!valid) {
      ignored += 1;
      continue;
    }
    const tokenClass = listing.class as TokenClass;
    const kids = armed[tokenClass] ?? [];
    if (!kids.includes(listing.kid as string)) kids.push(listing.kid as string);
    armed[tokenClass] = kids;
  }
  for (const tokenClass of Object.keys(armed) as TokenClass[]) {
    Object.freeze(armed[tokenClass]);
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
    (emergencyKids?.armed?.[entry.class]?.includes(entry.kid) ?? false)
  );
}
