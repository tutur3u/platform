/**
 * Publication evidence. The host collects, in the background, one report per
 * registered verifier deployment and a public fetch of
 * `/.well-known/jwks.json`, and builds a census from their raw bodies. The
 * census is reduced here, so thumbprints are always recomputed from `crv`,
 * `kty`, `x` and `y`, never read from the input.
 */
import { isTimestamp, TOKEN_CLASSES, type TokenClass } from '../token-core';
import { parseJwks } from './jwks';
import { type KeySet, type ParsedKeyEntry, parseKeySet } from './key-set';
import {
  type KeyObservation,
  type KeyObservationStore,
  type ObservationCache,
  observationKey,
  observationFor,
} from './observations';

/** A census older than this, in seconds, fails closed. */
export const MAX_CENSUS_AGE_SECONDS = 300;

/** The closed list of verifier deployment ids of each class. */
export type VerifierRegistry = Readonly<
  Partial<Record<TokenClass, readonly string[]>>
>;

/** One deployment's report: the raw key-set JSON it actually loaded. */
export type DeploymentReport = Readonly<{ deploymentId: string; body: string }>;

export type CensusInput = Readonly<{
  /** Seconds, when the last successful refresh completed. */
  takenAt: number;
  /** The raw body of the public fetch of `/.well-known/jwks.json`. */
  jwksBody: string;
  reports: Readonly<Partial<Record<TokenClass, readonly DeploymentReport[]>>>;
}>;

type ReducedReport = Readonly<{
  deploymentId: string;
  keys: ReadonlySet<string>;
}>;

export type PublicationCensus = Readonly<{
  takenAt: number;
  jwks: ReadonlySet<string>;
  reports: Readonly<Partial<Record<TokenClass, readonly ReducedReport[]>>>;
}>;

// Censuses buildCensus returned. publicationHolds accepts nothing else.
const builtCensuses = new WeakSet<object>();

const pairKey = (tokenClass: TokenClass, kid: string, thumbprint: string) =>
  `${tokenClass}|${kid}|${thumbprint}`;

/**
 * Reduces raw census bodies. A body that fails to parse holds no key, so the
 * deployment it came from fails publication. It never throws.
 */
export async function buildCensus(
  input: CensusInput
): Promise<PublicationCensus> {
  const takenAt = isTimestamp(input?.takenAt) ? input.takenAt : -1;
  const jwks = new Set<string>();
  const parsedJwks =
    typeof input?.jwksBody === 'string'
      ? await parseJwks(input.jwksBody)
      : null;
  for (const key of parsedJwks?.keys ?? []) {
    jwks.add(pairKey(key.class, key.kid, key.thumbprint));
  }
  const reports: Partial<Record<TokenClass, readonly ReducedReport[]>> = {};
  for (const tokenClass of TOKEN_CLASSES) {
    const raw = input?.reports?.[tokenClass];
    if (!Array.isArray(raw)) continue;
    const reduced: ReducedReport[] = [];
    for (const report of raw as readonly DeploymentReport[]) {
      const keys = new Set<string>();
      const deploymentId =
        typeof report?.deploymentId === 'string' ? report.deploymentId : '';
      const parsed =
        typeof report?.body === 'string' && takenAt >= 0
          ? await parseKeySet(report.body, { mode: 'verifier', now: takenAt })
          : null;
      if (parsed?.ok) {
        for (const entry of parsed.keySet.entries) {
          keys.add(pairKey(entry.class, entry.kid, entry.thumbprint));
        }
      }
      reduced.push(Object.freeze({ deploymentId, keys }));
    }
    reports[tokenClass] = Object.freeze(reduced);
  }
  const census: PublicationCensus = Object.freeze({
    takenAt,
    jwks,
    reports: Object.freeze(reports),
  });
  builtCensuses.add(census);
  return census;
}

/**
 * Whether `entry` is published everywhere it must be: the class's registry is
 * non-empty, the census is at most 300 seconds old, it holds exactly one
 * report for every registered deployment and none for anything else, and
 * every report and the served JWKS hold the same `(kid, thumbprint)`.
 */
export function publicationHolds(
  entry: ParsedKeyEntry,
  input: {
    registry: VerifierRegistry;
    census: PublicationCensus | null | undefined;
    now: number;
  }
): boolean {
  const { census, now } = input;
  if (!census || !builtCensuses.has(census)) return false;
  if (!isTimestamp(now) || census.takenAt < 0) return false;
  const age = now - census.takenAt;
  if (age < 0 || age > MAX_CENSUS_AGE_SECONDS) return false;

  const registered = input.registry?.[entry.class];
  if (!Array.isArray(registered) || registered.length === 0) return false;
  const ids = new Set(registered);
  if (
    ids.size !== registered.length ||
    registered.some((id) => typeof id !== 'string' || id.length === 0)
  ) {
    return false;
  }
  const reports = census.reports[entry.class] ?? [];
  if (reports.length !== ids.size) return false;
  const seen = new Set<string>();
  const wanted = pairKey(entry.class, entry.kid, entry.thumbprint);
  for (const report of reports) {
    if (!ids.has(report.deploymentId) || seen.has(report.deploymentId)) {
      return false;
    }
    seen.add(report.deploymentId);
    if (!report.keys.has(wanted)) return false;
  }
  return census.jwks.has(wanted);
}

/**
 * Inserts a row for every signing key whose publication holds and that has
 * no cached row, and returns the cache with the rows the store committed. A
 * store error or a row that does not match leaves that key without a row, so
 * it stays blocked; cached rows are kept.
 */
export async function refreshObservations(input: {
  keySet: KeySet;
  registry: VerifierRegistry;
  census: PublicationCensus | null | undefined;
  store: KeyObservationStore;
  cache: ObservationCache;
  now: number;
}): Promise<ObservationCache> {
  const cache = new Map<string, KeyObservation>(input.cache);
  for (const entry of input.keySet.entries) {
    if (!entry.privateKey || entry.status === 'retired') continue;
    if (observationFor(entry, cache)) continue;
    if (!publicationHolds(entry, input)) continue;
    const wanted = {
      class: entry.class,
      kid: entry.kid,
      thumbprint: entry.thumbprint,
    };
    let row: KeyObservation | 'unavailable';
    try {
      row = await input.store.getOrCreate(wanted);
    } catch {
      continue;
    }
    if (
      row === 'unavailable' ||
      typeof row !== 'object' ||
      row === null ||
      row.class !== wanted.class ||
      row.kid !== wanted.kid ||
      row.thumbprint !== wanted.thumbprint ||
      !isTimestamp(row.publishedAt) ||
      typeof row.bootstrap !== 'boolean'
    ) {
      continue;
    }
    cache.set(
      observationKey(wanted),
      Object.freeze({
        ...wanted,
        publishedAt: row.publishedAt,
        bootstrap: row.bootstrap,
      })
    );
  }
  return cache;
}
