/**
 * The observer's grant check as one step over its durable state. A run is a
 * successful read only when every page of members, user groups, user group
 * members and account tokens was read; anything less keeps the last
 * `identityBlocked` and the last success time.
 *
 * Trust boundary: each listing in a read run is untrusted Cloudflare API data
 * and arrives as JSON text, which host adapters build from the response
 * bodies they read; it is parsed here with the strict parser
 * (`untrusted-json`). The run's `kind`, the previous state, `nowMs` and the
 * classifier are trusted host values, each read or copied once at entry as
 * own data, so an inherited field or a getter supplies nothing.
 */
import type { JsonValue } from '../encoding';
import { ownValue } from './own-data';
import {
  classifyGrantPayload,
  copyGrantClassifier,
  type GrantClassifier,
  type GrantFinding,
} from './grants';
import {
  jsonArray,
  jsonField,
  jsonRecord,
  parseControlJson,
} from './untrusted-json';

/** A last successful read older than this sets `identityBlocked`. */
export const GRANT_READ_MAX_AGE_MS = 900_000;

/**
 * The JSON shape of one paged listing's text. `hasMore` is true when a page
 * remains unread.
 */
export type Listing<T> = Readonly<{ items: readonly T[]; hasMore: boolean }>;

export type GrantRun =
  | Readonly<{
      kind: 'read';
      /** JSON text of a `Listing<CfMember>`. */
      members: string;
      /** JSON text of a `Listing<CfUserGroup>`. */
      userGroups: string;
      /**
       * JSON text of an object of `Listing<string>` member id listings, one
       * for each listed user group, by group id.
       */
      userGroupMembers: string;
      /** JSON text of a `Listing<CfAccountToken>`. */
      tokens: string;
      /** Whether the run used its whole call cap; informational only. */
      capReached: boolean;
    }>
  /** An API error, a `429` or a timeout before the run finished. */
  | Readonly<{ kind: 'error'; reason: string }>;

export type GrantCheckState = Readonly<{
  identityBlocked: boolean;
  lastSuccessAtMs: number | null;
}>;

export type GrantCheckOutcome =
  | 'clean'
  | 'blocked'
  | 'unread_page'
  | 'malformed'
  | 'error';

export type GrantCheckResult = Readonly<{
  state: GrantCheckState;
  outcome: GrantCheckOutcome;
  /** A failed read, an unwaived finding or a stale success alerts. */
  alert: boolean;
  /** Whether the last success is older than 15 minutes after this run. */
  stale: boolean;
  findings: readonly GrantFinding[];
}>;

type ListingSnapshot = Readonly<{
  items: readonly JsonValue[];
  hasMore: boolean;
}>;

type RunSnapshot = Readonly<{
  members: ListingSnapshot;
  userGroups: ListingSnapshot;
  tokens: ListingSnapshot;
  userGroupMembers: ReadonlyMap<string, ListingSnapshot>;
}>;

type RunTexts = Readonly<{
  members: unknown;
  userGroups: unknown;
  tokens: unknown;
  userGroupMembers: unknown;
}>;

/**
 * A parsed listing's `items` array and boolean `hasMore`. Omitted, `null` or
 * non-array items, or a non-boolean `hasMore`, fail the read.
 */
function readListing(value: JsonValue | undefined): ListingSnapshot | null {
  const listing = jsonRecord(value);
  if (!listing) return null;
  const items = jsonArray(jsonField(listing, 'items'));
  const hasMore = jsonField(listing, 'hasMore');
  if (!items || typeof hasMore !== 'boolean') return null;
  return Object.freeze({ items, hasMore });
}

/** Every listing of a read run, or null when any text is malformed. */
function parseRun(texts: RunTexts): RunSnapshot | null {
  const members = readListing(parseControlJson(texts.members));
  const userGroups = readListing(parseControlJson(texts.userGroups));
  const tokens = readListing(parseControlJson(texts.tokens));
  const groups = jsonRecord(parseControlJson(texts.userGroupMembers));
  if (!members || !userGroups || !tokens || !groups) return null;
  const userGroupMembers = new Map<string, ListingSnapshot>();
  for (const groupId of Object.keys(groups)) {
    const listing = readListing(groups[groupId]);
    if (!listing) return null;
    userGroupMembers.set(groupId, listing);
  }
  return Object.freeze({ members, userGroups, tokens, userGroupMembers });
}

const isComplete = (snapshot: RunSnapshot) =>
  !snapshot.members.hasMore &&
  !snapshot.userGroups.hasMore &&
  !snapshot.tokens.hasMore &&
  snapshot.userGroups.items.every((group) => {
    const parsed = jsonRecord(group);
    const id = parsed ? jsonField(parsed, 'id') : undefined;
    const listing =
      typeof id === 'string' ? snapshot.userGroupMembers.get(id) : undefined;
    return listing !== undefined && !listing.hasMore;
  });

const isClock = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value);

/**
 * The previous state, read once as own data; anything unusable counts as no
 * success. A missing own clock is null and a missing own `identityBlocked`
 * is blocked.
 */
function readPrevious(value: unknown): GrantCheckState {
  if (typeof value !== 'object' || value === null) {
    return { identityBlocked: true, lastSuccessAtMs: null };
  }
  const identityBlocked = ownValue(value, 'identityBlocked');
  const lastSuccessAtMs = ownValue(value, 'lastSuccessAtMs');
  return {
    identityBlocked: identityBlocked !== false,
    lastSuccessAtMs: isClock(lastSuccessAtMs) ? lastSuccessAtMs : null,
  };
}

/**
 * Applies one grant check run. A complete read sets `identityBlocked` to
 * whether any Worker-wide grant lacks an open waiver and moves the success
 * time. A cap fails the run only when a page remains unread; an unread page,
 * a malformed payload (text that does not parse strictly, or a listing
 * without an `items` array) or an error keeps both stored values. After
 * either, a last success older than 15 minutes, or none, sets
 * `identityBlocked`.
 */
export function applyGrantRun(input: {
  run: GrantRun;
  previous: GrantCheckState | null | undefined;
  nowMs: number;
  classifier: GrantClassifier;
}): GrantCheckResult {
  const nowMs = ownValue(input, 'nowMs');
  const run = ownValue(input, 'run');
  const previous = readPrevious(ownValue(input, 'previous'));
  const classifier = copyGrantClassifier(ownValue(input, 'classifier'));
  const runObject = typeof run === 'object' && run !== null ? run : null;
  const kind = runObject ? ownValue(runObject, 'kind') : undefined;
  let texts: RunTexts | null = null;
  if (runObject && kind === 'read') {
    texts = {
      members: ownValue(runObject, 'members'),
      userGroups: ownValue(runObject, 'userGroups'),
      tokens: ownValue(runObject, 'tokens'),
      userGroupMembers: ownValue(runObject, 'userGroupMembers'),
    };
  }

  let state = previous;
  let outcome: GrantCheckOutcome;
  let findings: readonly GrantFinding[] = [];
  const snapshot = texts ? parseRun(texts) : null;
  if (!texts) {
    outcome = 'error';
  } else if (!snapshot || !classifier) {
    outcome = 'malformed';
  } else if (!isComplete(snapshot)) {
    outcome = 'unread_page';
  } else {
    const userGroupMembers = new Map<string, JsonValue>();
    for (const [groupId, listing] of snapshot.userGroupMembers) {
      userGroupMembers.set(groupId, listing.items as JsonValue);
    }
    const classified = classifyGrantPayload(
      {
        members: snapshot.members.items as JsonValue,
        userGroups: snapshot.userGroups.items as JsonValue,
        userGroupMembers,
        tokens: snapshot.tokens.items as JsonValue,
      },
      classifier,
      nowMs
    );
    if (!classified.ok || !isClock(nowMs)) {
      outcome = 'malformed';
    } else {
      findings = classified.findings;
      outcome = classified.blocked ? 'blocked' : 'clean';
      state = { identityBlocked: classified.blocked, lastSuccessAtMs: nowMs };
    }
  }
  const stale =
    state.lastSuccessAtMs === null ||
    !isClock(nowMs) ||
    nowMs - state.lastSuccessAtMs > GRANT_READ_MAX_AGE_MS;
  if (stale) state = { ...state, identityBlocked: true };
  return Object.freeze({
    state: Object.freeze(state),
    outcome,
    alert: outcome !== 'clean' || stale,
    stale,
    findings,
  });
}
