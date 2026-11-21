/**
 * The observer's Worker-wide grant classifier. It takes the platform
 * account's members, user groups and account-owned API tokens as the
 * Cloudflare API returns them, unions each identity's effective policies and
 * reports every identity that can upload, put a secret on or deploy any
 * Worker beyond one script, or both an auth script and the gateway.
 *
 * Trust boundary: the members, user groups, user group members and tokens
 * are untrusted API data. They arrive as JSON text, which host adapters pass
 * as the response bodies they read, and are parsed here with the strict
 * parser (`untrusted-json`). The script lists, `scriptResource`, the
 * committed waivers and `nowMs` are trusted host values; each is read or
 * copied once at entry as own data. Every input field, the listing texts
 * included, must be an own data property; an inherited field or a getter
 * reads as missing.
 */
import type { JsonValue } from '../encoding';
import { ownElements, ownStrings, ownValue } from './own-data';
import {
  type JsonRecord,
  jsonArray,
  jsonField,
  jsonRecord,
  parseControlJson,
} from './untrusted-json';

/** Admin or Editor permission groups that cover Workers. */
export const WORKER_WRITE_PERMISSION_GROUPS: readonly string[] = Object.freeze([
  'Workers Admin',
  'Workers Editor',
  'Developer Platform Admin',
  'Developer Platform Editor',
  'Workers Platform Admin',
  'Workers Scripts Edit',
  'Workers Scripts Write',
  'Workers CI Edit',
  'Workers Observability Edit',
  'Workers Observability Telemetry Edit',
]);

/** The account role `Administrator` and its legacy alias. */
export const ADMINISTRATOR_ROLES: readonly string[] = Object.freeze([
  'Administrator',
  'Account Administrator',
]);

/** The only exempt role: a standing residual the release authority accepts. */
export const EXEMPT_ROLE = 'Super Administrator - All Privileges';

const WRITE_NAMES = new Set([
  ...WORKER_WRITE_PERMISSION_GROUPS,
  ...ADMINISTRATOR_ROLES,
]);

/**
 * The JSON shapes the listing texts carry, as the Cloudflare API returns
 * them. Every field is untrusted and read only from the strict parse.
 */
export type CfNamed = Readonly<{ id?: unknown; name?: unknown }>;
export type CfResourceScope = Readonly<{ key?: unknown; objects?: unknown }>;
export type CfResourceGroup = Readonly<{ id?: unknown; scope?: unknown }>;
export type CfMemberPolicy = Readonly<{
  access?: unknown;
  permission_groups?: unknown;
  resource_groups?: unknown;
}>;
export type CfMember = Readonly<{
  id?: unknown;
  roles?: unknown;
  policies?: unknown;
}>;
export type CfUserGroup = Readonly<{ id?: unknown; policies?: unknown }>;
export type CfTokenPolicy = Readonly<{
  effect?: unknown;
  permission_groups?: unknown;
  resources?: unknown;
}>;
export type CfAccountToken = Readonly<{ id?: unknown; policies?: unknown }>;

export type IdentityKind = 'member' | 'token';

/** A waiver published as a commit reachable from `main`. */
export type GrantWaiver = Readonly<{
  id: string;
  identity: Readonly<{ kind: IdentityKind; id: string }>;
  expiresAtMs: number;
}>;

/** The trusted host configuration of the classifier. */
export type GrantClassifier = Readonly<{
  /** The `tuturuuu-auth` scripts and the `tuturuuu-gateway` scripts. */
  authScripts: readonly string[];
  gatewayScripts: readonly string[];
  /**
   * The Worker script a resource key names, or null. A resource that names
   * no single script is treated as the Workers product, the developer
   * platform or the account.
   */
  scriptResource: (key: string) => string | null;
  /** The committed waiver file's entries. */
  waivers: readonly GrantWaiver[];
}>;

export type GrantInput = GrantClassifier &
  Readonly<{
    /** JSON text: an array of `CfMember`. */
    members: string;
    /** JSON text: an array of `CfUserGroup`. */
    userGroups: string;
    /** JSON text: an object of account member id arrays by user group id. */
    userGroupMembers: string;
    /** JSON text: an array of `CfAccountToken`. */
    tokens: string;
    nowMs: number;
  }>;

/**
 * Parsed listings for `classifyGrantPayload`. Each value must come from
 * `parseControlJson`; anything else reads as malformed.
 */
export type GrantPayload = Readonly<{
  members: JsonValue | undefined;
  userGroups: JsonValue | undefined;
  /** The parsed member id array of each listed user group, by group id. */
  userGroupMembers: ReadonlyMap<string, JsonValue | undefined>;
  tokens: JsonValue | undefined;
}>;

/** A waiver copied once from the committed file. */
type WaiverCopy = Readonly<{
  id: string;
  kind: string;
  identityId: string;
  expiresAtMs: number;
}>;

/** The classifier configuration, copied once at entry. */
export type TrustedGrantClassifier = Readonly<{
  authScripts: readonly string[];
  gatewayScripts: readonly string[];
  scriptResource: (key: string) => string | null;
  waivers: readonly WaiverCopy[];
}>;

export type GrantReason =
  | Readonly<{ via: 'role'; name: string }>
  | Readonly<{ via: 'wide_policy'; permissionGroup: string }>
  | Readonly<{ via: 'both_scripts'; auth: string; gateway: string }>;

export type GrantFinding = Readonly<{
  kind: IdentityKind;
  id: string;
  reasons: readonly GrantReason[];
  /** The id of the open waiver covering this identity, if any. */
  waiverId: string | null;
}>;

export type GrantClassification =
  | Readonly<{
      ok: true;
      /** Worker-wide identities, waived or not. */
      findings: readonly GrantFinding[];
      /** Members holding the exempt role. */
      exempt: readonly string[];
      /** Whether any finding lacks an open waiver. */
      blocked: boolean;
    }>
  | Readonly<{ ok: false; reason: 'malformed' }>;

class MalformedPayload extends Error {}

const MALFORMED: GrantClassification = Object.freeze({
  ok: false,
  reason: 'malformed',
});

/** A required list: omitted, `null` or a non-array fails the read. */
function list(value: unknown): readonly JsonValue[] {
  const elements = jsonArray(value);
  if (!elements) throw new MalformedPayload();
  return elements;
}

/**
 * An optional list where omission only widens access: scope `objects`, whose
 * absence scopes a grant to the whole outer resource.
 */
function wideningList(value: JsonValue | undefined): readonly JsonValue[] {
  if (value === undefined || value === null) return [];
  return list(value);
}

function record(value: unknown): JsonRecord {
  const parsed = jsonRecord(value);
  if (!parsed) throw new MalformedPayload();
  return parsed;
}

function text(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new MalformedPayload();
  }
  return value;
}

/** Names of the permission groups or roles in a list. */
function names(value: JsonValue | undefined): string[] {
  const result: string[] = [];
  const entries = list(value);
  for (let index = 0; index < entries.length; index += 1) {
    result.push(text(jsonField(record(entries[index]), 'name')));
  }
  return result;
}

/** A resource: one named Worker script, or wider than any one script. */
type Resource = Readonly<{ script: string | null }>;

type Grant = Readonly<{ group: string; resources: readonly Resource[] }>;

type ScriptResource = TrustedGrantClassifier['scriptResource'];

function resourceOf(
  keys: readonly string[],
  scriptResource: ScriptResource
): Resource {
  const innermost = keys[keys.length - 1] as string;
  if (innermost === '*') return { script: null };
  const script = scriptResource(innermost);
  return { script: typeof script === 'string' ? script : null };
}

/** `resource_groups[].scope`, one object or an array, with `objects[].key`. */
function memberPolicyResources(
  policy: JsonRecord,
  scriptResource: ScriptResource
): Resource[] {
  const resources: Resource[] = [];
  for (const group of list(jsonField(policy, 'resource_groups'))) {
    const scope = jsonField(record(group), 'scope');
    for (const entry of jsonArray(scope) ?? [scope]) {
      const outer = text(jsonField(record(entry), 'key'));
      const objects = wideningList(jsonField(record(entry), 'objects'));
      if (objects.length === 0) {
        resources.push(resourceOf([outer], scriptResource));
      }
      for (const object of objects) {
        const inner = text(jsonField(record(object), 'key'));
        resources.push(resourceOf([outer, inner], scriptResource));
      }
    }
  }
  return resources;
}

/** Token `resources`: `{ outer: '*' }` or `{ outer: { inner: '*' } }`. */
function tokenPolicyResources(
  policy: JsonRecord,
  scriptResource: ScriptResource
): Resource[] {
  const resources: Resource[] = [];
  const outerMap = record(jsonField(policy, 'resources'));
  for (const outer of Object.keys(outerMap)) {
    const value = outerMap[outer];
    if (typeof value === 'string') {
      resources.push(resourceOf([outer], scriptResource));
      continue;
    }
    for (const inner of Object.keys(record(value))) {
      resources.push(resourceOf([outer, inner], scriptResource));
    }
  }
  return resources;
}

/**
 * The allow grants of a policy list. A deny policy grants nothing and is
 * never subtracted from the union, so an identity's access is never
 * understated. An effect other than `allow` or `deny` fails the read.
 */
function grantsOf(
  policies: JsonValue | undefined,
  kind: 'member' | 'token',
  scriptResource: ScriptResource
): Grant[] {
  const grants: Grant[] = [];
  for (const entry of list(policies)) {
    const policy = record(entry);
    const effect = jsonField(policy, kind === 'member' ? 'access' : 'effect');
    if (effect !== 'allow' && effect !== 'deny') throw new MalformedPayload();
    if (effect === 'deny') continue;
    const resources =
      kind === 'member'
        ? memberPolicyResources(policy, scriptResource)
        : tokenPolicyResources(policy, scriptResource);
    for (const group of names(jsonField(policy, 'permission_groups'))) {
      grants.push({ group, resources });
    }
  }
  return grants;
}

function firstListed(
  scripts: readonly string[],
  reached: ReadonlySet<string>
): string | undefined {
  for (let index = 0; index < scripts.length; index += 1) {
    const script = scripts[index] as string;
    if (reached.has(script)) return script;
  }
  return undefined;
}

/** Classifies one identity from its roles and the union of its grants. */
function classify(
  roles: readonly string[],
  grants: readonly Grant[],
  classifier: TrustedGrantClassifier
): GrantReason[] {
  const reasons: GrantReason[] = [];
  for (const role of roles) {
    if (WRITE_NAMES.has(role)) reasons.push({ via: 'role', name: role });
  }
  const scripts = new Set<string>();
  for (const grant of grants) {
    if (!WRITE_NAMES.has(grant.group)) continue;
    for (const resource of grant.resources) {
      if (resource.script === null) {
        reasons.push({ via: 'wide_policy', permissionGroup: grant.group });
      } else {
        scripts.add(resource.script);
      }
    }
  }
  const auth = firstListed(classifier.authScripts, scripts);
  const gateway = firstListed(classifier.gatewayScripts, scripts);
  if (auth !== undefined && gateway !== undefined) {
    reasons.push({ via: 'both_scripts', auth, gateway });
  }
  return reasons;
}

function isExempt(roles: readonly string[], grants: readonly Grant[]) {
  return (
    roles.includes(EXEMPT_ROLE) ||
    grants.some(
      (grant) =>
        grant.group === EXEMPT_ROLE &&
        grant.resources.some((resource) => resource.script === null)
    )
  );
}

/** One committed waiver, or null when any field is not own data. */
function copyWaiver(value: unknown): WaiverCopy | null {
  if (typeof value !== 'object' || value === null) return null;
  const id = ownValue(value, 'id');
  const identity = ownValue(value, 'identity');
  const expiresAtMs = ownValue(value, 'expiresAtMs');
  if (typeof identity !== 'object' || identity === null) return null;
  const kind = ownValue(identity, 'kind');
  const identityId = ownValue(identity, 'id');
  if (
    typeof id !== 'string' ||
    typeof kind !== 'string' ||
    typeof identityId !== 'string' ||
    typeof expiresAtMs !== 'number' ||
    !Number.isSafeInteger(expiresAtMs)
  ) {
    return null;
  }
  return Object.freeze({ id, kind, identityId, expiresAtMs });
}

/**
 * Copies the trusted classifier configuration once: the script lists as own
 * string elements, `scriptResource` as an own function and every waiver as
 * own data. A malformed waiver entry is dropped, so it opens nothing; a
 * missing list or function returns null and the run fails as malformed.
 */
export function copyGrantClassifier(
  value: unknown
): TrustedGrantClassifier | null {
  if (typeof value !== 'object' || value === null) return null;
  const authScripts = ownStrings(ownValue(value, 'authScripts'));
  const gatewayScripts = ownStrings(ownValue(value, 'gatewayScripts'));
  const scriptResource = ownValue(value, 'scriptResource');
  const entries = ownElements(ownValue(value, 'waivers'));
  if (
    !authScripts ||
    !gatewayScripts ||
    typeof scriptResource !== 'function' ||
    !entries
  ) {
    return null;
  }
  const waivers: WaiverCopy[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const waiver = copyWaiver(entries[index]);
    if (waiver) waivers.push(waiver);
  }
  return Object.freeze({
    authScripts: Object.freeze(authScripts),
    gatewayScripts: Object.freeze(gatewayScripts),
    scriptResource: scriptResource as ScriptResource,
    waivers: Object.freeze(waivers),
  });
}

function openWaiver(
  kind: IdentityKind,
  id: string,
  waivers: readonly WaiverCopy[],
  nowMs: unknown
): string | null {
  if (typeof nowMs !== 'number' || !Number.isSafeInteger(nowMs)) return null;
  for (const waiver of waivers) {
    if (
      waiver.kind === kind &&
      waiver.identityId === id &&
      nowMs < waiver.expiresAtMs
    ) {
      return waiver.id;
    }
  }
  return null;
}

/**
 * Classifies parsed listings with a copied classifier. The listings must
 * come from `parseControlJson`, and `nowMs` is the caller's single read of
 * its clock. It never throws.
 */
export function classifyGrantPayload(
  payload: GrantPayload,
  classifier: TrustedGrantClassifier,
  nowMs: unknown
): GrantClassification {
  try {
    const { scriptResource } = classifier;
    const groupGrants = new Map<string, Grant[]>();
    for (const entry of list(payload.userGroups)) {
      const group = record(entry);
      groupGrants.set(
        text(jsonField(group, 'id')),
        grantsOf(jsonField(group, 'policies'), 'member', scriptResource)
      );
    }
    const memberGroups = new Map<string, string[]>();
    for (const [groupId, memberIds] of payload.userGroupMembers) {
      if (!groupGrants.has(groupId)) throw new MalformedPayload();
      for (const memberId of list(memberIds)) {
        const id = text(memberId);
        memberGroups.set(id, [...(memberGroups.get(id) ?? []), groupId]);
      }
    }
    for (const groupId of groupGrants.keys()) {
      if (!payload.userGroupMembers.has(groupId)) throw new MalformedPayload();
    }

    const findings: GrantFinding[] = [];
    const exempt: string[] = [];
    const report = (kind: IdentityKind, id: string, reasons: GrantReason[]) => {
      if (reasons.length === 0) return;
      findings.push(
        Object.freeze({
          kind,
          id,
          reasons: Object.freeze(reasons),
          waiverId: openWaiver(kind, id, classifier.waivers, nowMs),
        })
      );
    };

    for (const entry of list(payload.members)) {
      const member = record(entry);
      const id = text(jsonField(member, 'id'));
      const roles = names(jsonField(member, 'roles'));
      const grants = [
        ...grantsOf(jsonField(member, 'policies'), 'member', scriptResource),
        ...(memberGroups.get(id) ?? []).flatMap(
          (groupId) => groupGrants.get(groupId) ?? []
        ),
      ];
      if (isExempt(roles, grants)) {
        exempt.push(id);
        continue;
      }
      report('member', id, classify(roles, grants, classifier));
    }
    for (const entry of list(payload.tokens)) {
      const token = record(entry);
      const grants = grantsOf(
        jsonField(token, 'policies'),
        'token',
        scriptResource
      );
      report(
        'token',
        text(jsonField(token, 'id')),
        classify([], grants, classifier)
      );
    }
    return Object.freeze({
      ok: true,
      findings: Object.freeze(findings),
      exempt: Object.freeze(exempt),
      blocked: findings.some((finding) => finding.waiverId === null),
    });
  } catch {
    return MALFORMED;
  }
}

/**
 * Classifies every member, with its direct policies unioned with the
 * policies of each user group it belongs to, and every account token, on the
 * union of all its policies. Role and permission group names match as the
 * full string; read-only groups never count. Each listing is JSON text;
 * every listing, `roles`, `policies`, `permission_groups` and
 * `resource_groups` must be an array, and names, ids and effects must be
 * strings. The spec marks none of them optional, so an omission fails the
 * read; only scope `objects` may be omitted, which widens the grant to the
 * outer resource. Text that does not parse strictly, or a malformed payload,
 * fails the read rather than being skipped. It never throws.
 */
export function classifyGrants(input: GrantInput): GrantClassification {
  try {
    const nowMs = ownValue(input, 'nowMs');
    const membersText = ownValue(input, 'members');
    const userGroupsText = ownValue(input, 'userGroups');
    const groupMembersText = ownValue(input, 'userGroupMembers');
    const tokensText = ownValue(input, 'tokens');
    const classifier = copyGrantClassifier(input);
    if (!classifier) return MALFORMED;
    const groupMembers = jsonRecord(parseControlJson(groupMembersText));
    if (!groupMembers) return MALFORMED;
    const userGroupMembers = new Map<string, JsonValue | undefined>();
    for (const groupId of Object.keys(groupMembers)) {
      userGroupMembers.set(groupId, groupMembers[groupId]);
    }
    return classifyGrantPayload(
      {
        members: parseControlJson(membersText),
        userGroups: parseControlJson(userGroupsText),
        userGroupMembers,
        tokens: parseControlJson(tokensText),
      },
      classifier,
      nowMs
    );
  } catch {
    return MALFORMED;
  }
}
