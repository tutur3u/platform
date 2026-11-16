/**
 * Plumbing for a hashed term denylist (FNV-1a 64, lower-cased words or
 * two-word phrases) on the public shipped feed. Intentionally EMPTY: hashes
 * of short names are guessable, so client names are not shipped even hashed.
 * The feed relies on its feat/perf public-scope allowlist and wording filter.
 */
export const CLIENT_TERM_HASHES: ReadonlySet<string> = new Set<string>([]);
