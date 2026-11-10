/**
 * Hashed terms (FNV-1a 64, lower-cased; single words or two-word phrases)
 * that must never appear in the public shipped feed, such as client or
 * organisation names. Only hashes are committed so the list itself never
 * publishes a name. Add one with:
 *   node apps/roadmap/scripts/hash-denylist-term.mjs "Term"
 */
export const CLIENT_TERM_HASHES: ReadonlySet<string> = new Set<string>([]);
