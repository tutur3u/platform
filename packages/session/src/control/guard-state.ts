/**
 * The held key guard list: how a verified response replaces or refreshes it,
 * and the read view the signer takes from it. `KeyObservations` and every
 * isolate run the same transition, so a restart or a cold isolate never
 * accepts an older list.
 */
import type {
  GuardResponseFailure,
  GuardKid,
  GuardList,
  GuardPin,
} from './guard-response';
import { verifyGuardResponse } from './guard-response';

/** The held list keeps `kids` and `mintHalt` in force for this long. */
export const GUARD_LIST_MAX_AGE_MS = 300_000;

/** A held list and the response bytes it was verified from. */
export type HeldGuardList = Readonly<{ list: GuardList; body: string }>;

export type GuardTransition =
  /** A greater `listVersion` replaced the held list. */
  | 'accepted'
  /** An equal list with a newer `issuedAtMs` refreshed it. */
  | 'refreshed'
  /** An equal list with an `issuedAtMs` no newer than the held one. */
  | 'unchanged'
  /** An equal `listVersion` with different signed content. */
  | 'conflict'
  /** A lower `listVersion`. */
  | 'rollback';

export type GuardTransitionResult = Readonly<{
  outcome: GuardTransition;
  held: HeldGuardList;
  /** Conflicts and rollbacks are alerted. */
  alert: boolean;
}>;

/** Compares two string lists as sorted arrays. */
function sameMembers(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) return false;
  const sortedRight = [...right].sort();
  return [...left].sort().every((value, index) => value === sortedRight[index]);
}

const kidKey = (kid: GuardKid) => `${kid.class}|${kid.kid}`;

/** Every signed member except `issuedAtMs` is the same. */
export function sameGuardContent(left: GuardList, right: GuardList): boolean {
  return (
    left.env === right.env &&
    left.listVersion === right.listVersion &&
    left.mintHalt === right.mintHalt &&
    left.identityBlocked === right.identityBlocked &&
    sameMembers(left.gatewayVersions, right.gatewayVersions) &&
    sameMembers(left.kids.map(kidKey), right.kids.map(kidKey))
  );
}

/**
 * The acceptance table: a greater `listVersion` replaces the held list, an
 * equal one with the same content refreshes its `issuedAtMs`, an equal one
 * with different content is a conflict and a lower one a rollback. A
 * conflict or a rollback keeps the held list unchanged.
 */
export function nextHeldGuardList(
  held: HeldGuardList | null | undefined,
  candidate: HeldGuardList
): GuardTransitionResult {
  const result = (
    outcome: GuardTransition,
    next: HeldGuardList
  ): GuardTransitionResult =>
    Object.freeze({
      outcome,
      held: next,
      alert: outcome === 'conflict' || outcome === 'rollback',
    });
  if (!held || candidate.list.listVersion > held.list.listVersion) {
    return result('accepted', candidate);
  }
  if (candidate.list.listVersion < held.list.listVersion) {
    return result('rollback', held);
  }
  if (!sameGuardContent(held.list, candidate.list)) {
    return result('conflict', held);
  }
  // An equal list never moves `issuedAtMs` backwards, so replaying an older
  // copy cannot shorten or extend the held list's age.
  return candidate.list.issuedAtMs > held.list.issuedAtMs
    ? result('refreshed', candidate)
    : result('unchanged', held);
}

export type GuardAcceptResult =
  | GuardTransitionResult
  | Readonly<{
      outcome: 'invalid';
      reason: GuardResponseFailure;
      held: HeldGuardList | null;
      alert: true;
    }>;

/**
 * Verifies a fetched or stored response and applies the transition. An
 * invalid response keeps the held list.
 */
export async function acceptGuardResponse(
  body: string,
  input: {
    pin: GuardPin;
    expectedEnv: string;
    nowMs: number;
    held: HeldGuardList | null | undefined;
  }
): Promise<GuardAcceptResult> {
  const verified = await verifyGuardResponse(body, input);
  if (!verified.ok) {
    return Object.freeze({
      outcome: 'invalid',
      reason: verified.reason,
      held: input.held ?? null,
      alert: true,
    });
  }
  return nextHeldGuardList(input.held, {
    list: verified.list,
    body: verified.body,
  });
}

/** What the signer reads from the held list at `nowMs`. */
export type GuardReadView = Readonly<{
  /** The value the host passes to slice 2a as `TTR_TOKEN_EMERGENCY_KIDS`. */
  kids: readonly GuardKid[];
  mintHalt: boolean;
  gatewayVersions: readonly string[];
  identityBlocked: boolean;
  /** Whether `kids` and `mintHalt` have lapsed with the list's age. */
  lapsed: boolean;
  listVersion: number | null;
}>;

const NO_KIDS: readonly GuardKid[] = Object.freeze([]);
const NO_VERSIONS: readonly string[] = Object.freeze([]);

/**
 * The read view. A held list is in force until its `issuedAtMs` is 300
 * seconds old; past that `kids` reads empty and `mintHalt` false, while
 * `gatewayVersions` and `identityBlocked` keep their held values, so a guard
 * outage never fails an accepted gateway version and never clears a block.
 * With no held list there is no accepted gateway version, no armed `kid` and
 * the identity class reads blocked.
 */
export function guardReadView(
  held: HeldGuardList | null | undefined,
  nowMs: number
): GuardReadView {
  if (!held) {
    return Object.freeze({
      kids: NO_KIDS,
      mintHalt: false,
      gatewayVersions: NO_VERSIONS,
      identityBlocked: true,
      lapsed: true,
      listVersion: null,
    });
  }
  const { list } = held;
  const lapsed =
    !Number.isSafeInteger(nowMs) ||
    nowMs - list.issuedAtMs > GUARD_LIST_MAX_AGE_MS;
  return Object.freeze({
    kids: lapsed ? NO_KIDS : list.kids,
    mintHalt: lapsed ? false : list.mintHalt,
    gatewayVersions: list.gatewayVersions,
    identityBlocked: list.identityBlocked,
    lapsed,
    listVersion: list.listVersion,
  });
}

/** Canonical `TTR_TOKEN_EMERGENCY_KIDS` text for a read view's `kids`. */
export function emergencyKidsJson(view: GuardReadView): string {
  return JSON.stringify(
    view.kids.map((kid) => ({ class: kid.class, kid: kid.kid }))
  );
}
