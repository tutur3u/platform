/**
 * Identity membership for the publication census. The authority is the
 * Cloudflare API view of `tuturuuu-gateway`: each version with traffic
 * projects its mount map from `GATEWAY_MOUNTED_PATHS` and its
 * `MOUNT_<SEGMENT>` service bindings, exactly as the gateway admits mounts.
 * The gateway's `MountInventory.list()` artifact must equal that map.
 *
 * Trust boundary: the version view and the `list()` artifact are untrusted
 * API data. They arrive as JSON text, which host adapters build from the
 * response bodies they read, and are parsed here with the strict parser
 * (`untrusted-json`). The version text alone is parsed under the canonical
 * `finiteDecimal` number policy, because Cloudflare types a version's
 * `percentage` as a number from 0.01 to 100; its bindings still hold only
 * safe integers. The environment, the artifact status, the guard's accepted
 * versions and `identityBlocked` (from a verified guard list) and the highest
 * registry version seen are trusted host values, each read or copied once at
 * entry as own data. Every input field must be an own data property; an
 * inherited field or a getter reads as missing.
 */
import type { JsonValue } from '../encoding';
import { isTimestamp } from '../token-core';
import { ownStrings, ownValue } from './own-data';
import {
  type JsonRecord,
  jsonArray,
  jsonField,
  jsonRecord,
  onlySafeIntegers,
  parseControlJson,
} from './untrusted-json';

/** One identity registry entry. `mountId` is the path segment (`mail`). */
export type MountEntry = Readonly<{
  mountId: string;
  script: string;
  base: string;
}>;

/** The JSON shape of a binding as the Cloudflare versions API returns it. */
export type CfBinding = Readonly<{
  name?: unknown;
  type?: unknown;
  text?: unknown;
  service?: unknown;
}>;

/** The JSON shape of a gateway version with traffic and its bindings. */
export type GatewayTrafficVersion = Readonly<{
  versionId: string;
  percentage: number;
  bindings: readonly CfBinding[];
}>;

export type MembershipFailure =
  | 'identity_blocked'
  | 'no_traffic'
  | 'bad_version'
  | 'unaccepted_version'
  | 'bad_bindings'
  | 'version_maps_differ'
  | 'artifact_unavailable'
  | 'bad_artifact'
  | 'wrong_env'
  | 'artifact_version_without_traffic'
  | 'registry_rollback'
  | 'duplicate_entry'
  | 'missing_entry'
  | 'extra_entry'
  | 'entry_mismatch';

export type MembershipResult =
  | Readonly<{
      ok: true;
      mounts: readonly MountEntry[];
      registryVersion: number;
    }>
  | Readonly<{ ok: false; reason: MembershipFailure }>;

export type ProjectionResult =
  | Readonly<{ ok: true; mounts: readonly MountEntry[] }>
  | Readonly<{ ok: false }>;

const MOUNT_SEGMENT = /^[a-z][a-z0-9-]*$/u;
const MOUNTED_PATHS = 'GATEWAY_MOUNTED_PATHS';
const ARTIFACT_MEMBERS = [
  'env',
  'gatewayVersionId',
  'mounts',
  'registryVersion',
];
const ENTRY_MEMBERS = ['base', 'mountId', 'script'];

const byMountId = (left: MountEntry, right: MountEntry) =>
  left.mountId < right.mountId ? -1 : left.mountId > right.mountId ? 1 : 0;

/** The binding name the gateway reads for a mount segment. */
export function mountBindingName(segment: string): string {
  return `MOUNT_${segment.replace(/-/gu, '_').toUpperCase()}`;
}

type Binding = Readonly<{
  type: string;
  text: JsonValue | undefined;
  service: JsonValue | undefined;
}>;

/** The mount map of parsed bindings; see `projectMountMap`. */
function projectBindings(value: JsonValue | undefined): ProjectionResult {
  const bindings = jsonArray(value);
  if (!bindings || !onlySafeIntegers(bindings)) return { ok: false };
  const byName = new Map<string, Binding>();
  for (const entry of bindings) {
    const binding = jsonRecord(entry);
    const name = binding ? jsonField(binding, 'name') : undefined;
    const type = binding ? jsonField(binding, 'type') : undefined;
    if (
      !binding ||
      typeof name !== 'string' ||
      typeof type !== 'string' ||
      byName.has(name)
    ) {
      return { ok: false };
    }
    byName.set(name, {
      type,
      text: jsonField(binding, 'text'),
      service: jsonField(binding, 'service'),
    });
  }
  const paths = byName.get(MOUNTED_PATHS);
  let listed = '';
  if (paths) {
    if (paths.type !== 'plain_text' || typeof paths.text !== 'string') {
      return { ok: false };
    }
    listed = paths.text;
  }
  const segments = new Set<string>();
  for (const raw of listed.split(',')) {
    const entry = raw.trim();
    const base = entry.endsWith('/*') ? entry.slice(0, -2) : entry;
    const segment = base.slice(1);
    if (!base.startsWith('/') || !MOUNT_SEGMENT.test(segment)) continue;
    if (segment === 'api') continue;
    segments.add(segment);
  }
  const mounts: MountEntry[] = [];
  for (const segment of segments) {
    const binding = byName.get(mountBindingName(segment));
    if (!binding || binding.type !== 'service') continue;
    if (typeof binding.service !== 'string' || binding.service === '') {
      return { ok: false };
    }
    mounts.push(
      Object.freeze({
        mountId: segment,
        script: binding.service,
        base: `/${segment}`,
      })
    );
  }
  return { ok: true, mounts: Object.freeze(mounts.sort(byMountId)) };
}

/**
 * Projects one gateway version's effective mount map from the JSON text of
 * its `CfBinding` array. A listed base (`/x` or `/x/*`) mounts only when a
 * `MOUNT_<SEGMENT>` service binding exists for it; `/api` and malformed
 * entries never mount, as in the gateway. Text that does not parse strictly,
 * a duplicate binding name or a malformed binding fails the projection.
 */
export function projectMountMap(bindings: string): ProjectionResult {
  return projectBindings(parseControlJson(bindings));
}

/** Cloudflare's `percentage`: more than 0 and at most 100. */
const isTrafficPercentage = (value: unknown): value is number =>
  typeof value === 'number' && value > 0 && value <= 100;

const sameEntry = (left: MountEntry, right: MountEntry) =>
  left.mountId === right.mountId &&
  left.script === right.script &&
  left.base === right.base;

const sameMap = (left: readonly MountEntry[], right: readonly MountEntry[]) =>
  left.length === right.length &&
  left.every((entry, index) => sameEntry(entry, right[index] as MountEntry));

const exactMembers = (value: JsonRecord, members: string[]) =>
  Object.keys(value).length === members.length &&
  members.every((member) => Object.hasOwn(value, member));

type Artifact = Readonly<{
  env: string;
  gatewayVersionId: string;
  registryVersion: number;
  mounts: readonly JsonValue[];
}>;

function readArtifact(value: JsonValue | undefined): Artifact | null {
  const artifact = jsonRecord(value);
  if (!artifact || !exactMembers(artifact, ARTIFACT_MEMBERS)) return null;
  const env = jsonField(artifact, 'env');
  const gatewayVersionId = jsonField(artifact, 'gatewayVersionId');
  const registryVersion = jsonField(artifact, 'registryVersion');
  const mounts = jsonArray(jsonField(artifact, 'mounts'));
  if (
    typeof env !== 'string' ||
    typeof gatewayVersionId !== 'string' ||
    !isTimestamp(registryVersion) ||
    !mounts
  ) {
    return null;
  }
  return { env, gatewayVersionId, registryVersion, mounts };
}

function readEntry(value: JsonValue): MountEntry | null {
  const entry = jsonRecord(value);
  if (!entry || !exactMembers(entry, ENTRY_MEMBERS)) return null;
  const mountId = jsonField(entry, 'mountId');
  const script = jsonField(entry, 'script');
  const base = jsonField(entry, 'base');
  if (
    typeof mountId !== 'string' ||
    typeof script !== 'string' ||
    typeof base !== 'string'
  ) {
    return null;
  }
  return { mountId, script, base };
}

/**
 * Checks identity membership for one census tick. It fails when the guard
 * list marks the identity class blocked; when a version with traffic is not
 * in the guard's accepted `gatewayVersions`; when two versions with traffic
 * project different maps; when the artifact names another environment, a
 * version without traffic or a `registryVersion` lower than the highest seen;
 * or when `list()` and the projected map differ in any entry. Version text
 * that does not parse strictly to an array fails as `no_traffic`, and
 * artifact text that does not parse strictly fails as `bad_artifact`. A
 * version's `percentage` may be a canonical decimal in `(0, 100]`; anything
 * else fails as `bad_version`. The class proceeds only when the own value of
 * `identityBlocked` is exactly `false`.
 */
export function checkIdentityMembership(input: {
  env: string;
  /** JSON text: an array of `GatewayTrafficVersion`. */
  trafficVersions: string;
  /** JSON text of `MountInventory.list()`, read only when the call is `ok`. */
  artifact: string;
  artifactStatus: 'ok' | 'timeout' | 'error';
  acceptedGatewayVersions: readonly string[];
  identityBlocked: boolean;
  highestRegistryVersion: number | null;
}): MembershipResult {
  const env = ownValue(input, 'env');
  const versionsText = ownValue(input, 'trafficVersions');
  const artifactText = ownValue(input, 'artifact');
  const artifactStatus = ownValue(input, 'artifactStatus');
  const accepted = new Set(
    ownStrings(ownValue(input, 'acceptedGatewayVersions')) ?? []
  );
  const identityBlocked = ownValue(input, 'identityBlocked');
  const highest = ownValue(input, 'highestRegistryVersion');
  const fail = (reason: MembershipFailure): MembershipResult =>
    Object.freeze({ ok: false, reason });
  if (identityBlocked !== false) return fail('identity_blocked');
  const versions = jsonArray(parseControlJson(versionsText, 'finiteDecimal'));
  if (!versions || versions.length === 0) return fail('no_traffic');
  const versionIds = new Set<string>();
  let map: readonly MountEntry[] | null = null;
  for (const entry of versions) {
    const version = jsonRecord(entry);
    const versionId = version ? jsonField(version, 'versionId') : undefined;
    const percentage = version ? jsonField(version, 'percentage') : undefined;
    if (
      !version ||
      typeof versionId !== 'string' ||
      versionId === '' ||
      versionIds.has(versionId) ||
      !isTrafficPercentage(percentage)
    ) {
      return fail('bad_version');
    }
    versionIds.add(versionId);
    if (!accepted.has(versionId)) return fail('unaccepted_version');
    const projected = projectBindings(jsonField(version, 'bindings'));
    if (!projected.ok) return fail('bad_bindings');
    if (map && !sameMap(map, projected.mounts)) {
      return fail('version_maps_differ');
    }
    map = projected.mounts;
  }

  if (artifactStatus !== 'ok') return fail('artifact_unavailable');
  const artifact = readArtifact(parseControlJson(artifactText));
  if (!artifact) return fail('bad_artifact');
  if (artifact.env !== env) return fail('wrong_env');
  if (!versionIds.has(artifact.gatewayVersionId)) {
    return fail('artifact_version_without_traffic');
  }
  if (
    highest !== null &&
    !(typeof highest === 'number' && artifact.registryVersion >= highest)
  ) {
    return fail('registry_rollback');
  }

  const listed = new Map<string, MountEntry>();
  const bases = new Set<string>();
  for (const raw of artifact.mounts) {
    const entry = readEntry(raw);
    if (!entry) return fail('bad_artifact');
    if (listed.has(entry.mountId) || bases.has(entry.base)) {
      return fail('duplicate_entry');
    }
    listed.set(entry.mountId, entry);
    bases.add(entry.base);
  }
  const projected = map ?? [];
  for (const entry of projected) {
    const found = listed.get(entry.mountId);
    if (!found) return fail('missing_entry');
    if (!sameEntry(found, entry)) return fail('entry_mismatch');
  }
  if (listed.size !== projected.length) return fail('extra_entry');
  return Object.freeze({
    ok: true,
    mounts: projected,
    registryVersion: artifact.registryVersion,
  });
}
