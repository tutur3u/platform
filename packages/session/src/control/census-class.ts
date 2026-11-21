/**
 * One class's census from published entries, live deployments and reports.
 * A passing class yields slice 2a inputs: a registry id and a report body
 * for every live version of every entry, so `publicationHolds` passes only
 * when every live version's configured bundle holds the key.
 *
 * Trust boundary: the deployments and the entry reports are untrusted API
 * and verifier data. They arrive as JSON text, which host adapters build
 * from the response bodies they read, and are parsed here with the strict
 * parser (`untrusted-json`). The deployment text alone is parsed under the
 * canonical `finiteDecimal` number policy, because Cloudflare types a
 * version's `percentage` as a number from 0.01 to 100; the reports stay on
 * safe integers. The published entries come from the registry or a passing
 * membership and are trusted host values, copied once at entry as own data.
 * Every input field must be an own data property; an inherited field or a
 * getter reads as missing.
 */
import { canonicalJson, type JsonValue, parseStrictJson } from '../encoding';
import { ownElements, ownValue } from './own-data';
import {
  jsonArray,
  jsonField,
  jsonRecord,
  parseControlJson,
} from './untrusted-json';

/** A published entry and the script whose deployment serves it. */
export type PublishedEntry = Readonly<{ entryId: string; script: string }>;

/** The JSON shape of a live version and its configured bundle (raw JSON). */
export type LiveVersion = Readonly<{
  versionId: string;
  percentage: number;
  bundle: string;
}>;

/**
 * The JSON shape of a script's active deployment, or `"unavailable"` when it
 * could not be read.
 */
export type ActiveDeployment =
  | Readonly<{ versions: readonly LiveVersion[] }>
  | 'unavailable';

/** The JSON shape of one entry's `KeysReportEntry.report()` result. */
export type EntryReport =
  | Readonly<{
      entryId: string;
      outcome: 'ok';
      versionId: string;
      keys: string;
    }>
  | Readonly<{ entryId: string; outcome: 'timeout' | 'error' }>;

/** Structurally equal to slice 2a's `DeploymentReport`. */
export type CensusReport = Readonly<{ deploymentId: string; body: string }>;

export type ClassCensusFailure =
  | 'duplicate_entry'
  | 'no_deployment'
  | 'bad_deployment'
  | 'unpublished_report'
  | 'duplicate_report'
  | 'timeout'
  | 'error'
  | 'missing_report'
  | 'unknown_version'
  | 'key_mismatch';

export type ClassCensusResult =
  | Readonly<{
      ok: true;
      /** The class's `VerifierRegistry` ids: `<entryId>@<versionId>`. */
      registry: readonly string[];
      /** The class's `CensusInput.reports`. */
      reports: readonly CensusReport[];
    }>
  | Readonly<{ ok: false; reason: ClassCensusFailure; entryId: string | null }>;

/** The registry id of one live version of one entry. */
export function censusDeploymentId(entryId: string, versionId: string): string {
  return `${entryId}@${versionId}`;
}

function canonicalBundle(text: unknown): string | undefined {
  if (typeof text !== 'string') return undefined;
  const parsed = parseStrictJson(text);
  return parsed === undefined ? undefined : canonicalJson(parsed);
}

function readDeployment(
  deployment: JsonValue | undefined
): readonly LiveVersion[] | 'unavailable' | 'bad' {
  if (deployment === undefined || deployment === 'unavailable') {
    return 'unavailable';
  }
  const record = jsonRecord(deployment);
  const versions = jsonArray(record ? jsonField(record, 'versions') : null);
  if (!versions || versions.length === 0) return 'bad';
  const ids = new Set<string>();
  const live: LiveVersion[] = [];
  for (const entry of versions) {
    const version = jsonRecord(entry);
    if (!version) return 'bad';
    const versionId = jsonField(version, 'versionId');
    const percentage = jsonField(version, 'percentage');
    const bundle = jsonField(version, 'bundle');
    if (
      typeof versionId !== 'string' ||
      versionId === '' ||
      ids.has(versionId) ||
      typeof percentage !== 'number' ||
      !(percentage > 0 && percentage <= 100) ||
      typeof bundle !== 'string'
    ) {
      return 'bad';
    }
    ids.add(versionId);
    live.push({ versionId, percentage, bundle });
  }
  return live;
}

type ReportCopy = Readonly<{
  entryId: string;
  outcome: JsonValue | undefined;
  versionId: JsonValue | undefined;
  keys: JsonValue | undefined;
}>;

/**
 * The trusted entries, copied once as own data. Omitted entries are an empty
 * class; anything else that is not an array of own string fields is null.
 */
function copyEntries(value: unknown): PublishedEntry[] | null {
  if (value === undefined || value === null) return [];
  const elements = ownElements(value);
  if (!elements) return null;
  const entries: PublishedEntry[] = [];
  for (const element of elements) {
    if (typeof element !== 'object' || element === null) return null;
    const entryId = ownValue(element, 'entryId');
    const script = ownValue(element, 'script');
    if (typeof entryId !== 'string' || typeof script !== 'string') return null;
    entries.push({ entryId, script });
  }
  return entries;
}

/**
 * A class's census succeeds only when every published entry has an active
 * deployment and exactly one report, the report's `versionId` is one of that
 * deployment's versions and its keys equal that version's configured bundle.
 * A timeout, an error, a missing entry, a report for an unpublished entry, a
 * duplicate or a mismatch fails the class. An empty entry list passes with an
 * empty registry, which mints nothing.
 *
 * `deployments` is JSON text of an object of `ActiveDeployment` by script
 * name, and `reports` JSON text of an `EntryReport` array. Deployment text
 * that does not parse strictly to an object leaves every entry without a
 * deployment, and report text that does not parse strictly to an array
 * leaves every entry without a report. A live version's `percentage` may be
 * a canonical decimal in `(0, 100]`; anything else is a bad deployment.
 */
export function evaluateClassCensus(input: {
  entries: readonly PublishedEntry[];
  deployments: string;
  reports: string;
}): ClassCensusResult {
  const fail = (
    reason: ClassCensusFailure,
    entryId: string | null = null
  ): ClassCensusResult => Object.freeze({ ok: false, reason, entryId });
  const published = copyEntries(ownValue(input, 'entries'));
  const deployments = jsonRecord(
    parseControlJson(ownValue(input, 'deployments'), 'finiteDecimal')
  );
  const reportList =
    jsonArray(parseControlJson(ownValue(input, 'reports'))) ?? [];
  if (!published) return fail('duplicate_entry');
  const entries = new Map<string, PublishedEntry>();
  for (const entry of published) {
    if (entry.entryId === '' || entries.has(entry.entryId)) {
      return fail('duplicate_entry', entry.entryId);
    }
    entries.set(entry.entryId, entry);
  }
  const reports = new Map<string, ReportCopy>();
  for (const value of reportList) {
    const report = jsonRecord(value);
    const entryId = report ? jsonField(report, 'entryId') : undefined;
    if (!report || typeof entryId !== 'string' || !entries.has(entryId)) {
      return fail(
        'unpublished_report',
        typeof entryId === 'string' ? entryId : null
      );
    }
    if (reports.has(entryId)) return fail('duplicate_report', entryId);
    reports.set(entryId, {
      entryId,
      outcome: jsonField(report, 'outcome'),
      versionId: jsonField(report, 'versionId'),
      keys: jsonField(report, 'keys'),
    });
  }

  const registry: string[] = [];
  const bodies: CensusReport[] = [];
  for (const [entryId, entry] of entries) {
    const report = reports.get(entryId);
    if (!report) return fail('missing_report', entryId);
    if (report.outcome === 'timeout') return fail('timeout', entryId);
    if (report.outcome !== 'ok') return fail('error', entryId);
    const versions = readDeployment(
      deployments ? jsonField(deployments, entry.script) : undefined
    );
    if (versions === 'unavailable') return fail('no_deployment', entryId);
    if (versions === 'bad') return fail('bad_deployment', entryId);
    let running: LiveVersion | undefined;
    for (const version of versions) {
      if (version.versionId === report.versionId) running = version;
    }
    if (!running) return fail('unknown_version', entryId);
    const reported = canonicalBundle(report.keys);
    if (
      reported === undefined ||
      reported !== canonicalBundle(running.bundle)
    ) {
      return fail('key_mismatch', entryId);
    }
    for (const version of versions) {
      const deploymentId = censusDeploymentId(entryId, version.versionId);
      registry.push(deploymentId);
      bodies.push(Object.freeze({ deploymentId, body: version.bundle }));
    }
  }
  return Object.freeze({
    ok: true,
    registry: Object.freeze(registry),
    reports: Object.freeze(bodies),
  });
}

/**
 * The identity class's published entries from a passing membership, copied
 * as own data. A malformed mount list throws rather than dropping an entry,
 * which would leave a live verifier out of the census.
 */
export function identityEntries(
  mounts: readonly Readonly<{ mountId: string; script: string }>[]
): readonly PublishedEntry[] {
  const elements = ownElements(mounts);
  if (!elements) throw new TypeError('mounts must be an array');
  const entries: PublishedEntry[] = [];
  for (const mount of elements) {
    const entryId =
      typeof mount === 'object' && mount !== null
        ? ownValue(mount, 'mountId')
        : undefined;
    const script =
      typeof mount === 'object' && mount !== null
        ? ownValue(mount, 'script')
        : undefined;
    if (typeof entryId !== 'string' || typeof script !== 'string') {
      throw new TypeError('a mount must have a string mountId and script');
    }
    entries.push(Object.freeze({ entryId, script }));
  }
  return Object.freeze(entries);
}
