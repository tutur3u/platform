/**
 * The invariants the device property tests assert after every operation,
 * judged per applied write (with the mutation that made it), per commit
 * call, and over the device as a whole. Test-only by path.
 */
import { expect } from 'vitest';
import { constantTimeEqual } from '../encoding';
import {
  type DeviceMutation,
  type DeviceState,
  MAX_EXPIRED_IDS,
  MAX_RECORDS,
  operationStatus,
  type ResolveResult,
} from '../device';
import { testHashSecret } from './device-fakes';
import { REGISTRY } from './device-fixtures';
import type { AppliedWrite, CommitRecord, Model } from './device-property';
import { DEVICE_ID } from './device-property';

const RECORDED = new Set([
  'sign_in',
  'switch',
  'rotate',
  'record_factors',
  'redeem_child',
  'grant_step_up',
  'consume_step_up',
]);
const GEN_KINDS = new Set([
  'sign_in',
  'switch',
  'rotate',
  'record_factors',
  'grant_step_up',
]);
const REVOCATIONS = new Set([
  'revoke',
  'revoke_user_below_epoch',
  'revoke_user_on_device',
]);

type Fenced = {
  fence?: { sessionId: string | null; gen: number; version: number } | null;
};
type WithEpoch = { epoch?: { userId: string; epoch: number } };

function fenceMatches(state: DeviceState, fence: NonNullable<Fenced['fence']>) {
  return (
    fence.sessionId === state.activeSid &&
    fence.gen === state.gen &&
    fence.version === state.version
  );
}

function newlyRevoked(write: AppliedWrite) {
  return Object.values(write.next.sessions).filter((row) => {
    const before = write.base.sessions[row.sid];
    return (
      before !== undefined &&
      before.revokedAt === null &&
      row.revokedAt !== null
    );
  });
}

/** One applied write against the mutation that made it. */
function checkWrite(write: AppliedWrite, committedOps: Set<string>) {
  const { tag, base, next } = write;
  const where =
    tag === 'housekeeping' ? 'housekeeping' : `${tag.kind} ${tag.operationId}`;
  expect(Object.keys(next.operations).length, where).toBeLessThanOrEqual(
    MAX_RECORDS
  );
  expect(Object.keys(next.expiredOperations).length, where).toBeLessThanOrEqual(
    MAX_EXPIRED_IDS
  );
  expect([base.version, base.version + 1], where).toContain(next.version);

  // At most one current generation; a grace secret only from `rotate`.
  if (next.gen !== base.gen) {
    expect(next.gen, where).toBe(base.gen + 1);
    expect(tag !== 'housekeeping' && GEN_KINDS.has(tag.kind), where).toBe(true);
    if (tag !== 'housekeeping' && tag.kind === 'rotate') {
      expect(next.grace?.gen, where).toBe(base.gen);
      expect(
        constantTimeEqual(
          next.grace?.secretHash ?? new Uint8Array(),
          base.secretHash
        ),
        where
      ).toBe(true);
    } else {
      expect(next.grace, where).toBeNull();
    }
  } else {
    expect(next.grace, where).toEqual(base.grace);
    expect(next.secretHash, where).toEqual(base.secretHash);
  }
  if (tag === 'housekeeping') {
    expect(next.activeSid, where).toBe(base.activeSid);
    expect(next.operations, where).toEqual(base.operations);
    expect(newlyRevoked(write), where).toEqual([]);
    return;
  }

  // No fenced mutation commits against a state whose fence differs.
  const fence = (tag as Fenced).fence;
  if (fence) expect(fenceMatches(base, fence), `${where} fence`).toBe(true);
  if (tag.kind === 'sign_in' && fence === null)
    expect(base.version, where).toBe(0);

  // A replayed operation id never applies a second transition.
  if (RECORDED.has(tag.kind)) {
    expect(Object.hasOwn(base.operations, tag.operationId), where).toBe(false);
    expect(Object.hasOwn(base.expiredOperations, tag.operationId), where).toBe(
      false
    );
    expect(
      committedOps.has(tag.operationId),
      `${where} second transition`
    ).toBe(false);
    committedOps.add(tag.operationId);
  }

  checkRevocations(write, tag, where);
  checkEpochsAndGrants(write, tag, where);
}

function checkRevocations(
  write: AppliedWrite,
  tag: DeviceMutation,
  where: string
) {
  const revoked = newlyRevoked(write);
  const base = write.base;
  for (const row of revoked) {
    const before = base.sessions[row.sid] as DeviceState['sessions'][string];
    switch (tag.kind) {
      case 'revoke_user_below_epoch':
        // Exclusive: a session at or above the bump is never revoked by it.
        expect(row.userId, where).toBe(tag.userId);
        expect(before.epochSeen, where).toBeLessThan(tag.belowEpoch);
        break;
      case 'revoke_user_on_device':
        // Eviction never removes another user's sessions or another slot's.
        expect(row.userId, where).toBe(tag.userId);
        expect(row.reservationId, where).toBe(tag.reservationId);
        break;
      case 'revoke':
        // The named session and its children only.
        expect(
          row.sid === tag.sessionId || before.parentSid === tag.sessionId,
          where
        ).toBe(true);
        break;
      case 'sign_in':
        expect(row.userId, where).toBe(tag.outcome.userId);
        break;
      default: {
        // Only a session refused for being below a fresh epoch.
        const epoch = (tag as WithEpoch).epoch;
        expect(row.userId, where).toBe(epoch?.userId);
        expect(before.epochSeen, where).toBeLessThan(epoch?.epoch ?? 0);
      }
    }
  }
}

function checkEpochsAndGrants(
  write: AppliedWrite,
  tag: DeviceMutation,
  where: string
) {
  const { base, next } = write;
  const record = RECORDED.has(tag.kind)
    ? next.operations[tag.operationId]
    : undefined;
  const ok = record?.result.ok === true;
  const epoch = (tag as WithEpoch).epoch?.epoch ?? 0;
  const baseActive = base.activeSid ? base.sessions[base.activeSid] : undefined;
  const nextActive = next.activeSid ? next.sessions[next.activeSid] : undefined;
  // No session below a fresh epoch is activated, granted or consumed.
  if (
    ok &&
    (tag.kind === 'sign_in' ||
      tag.kind === 'switch' ||
      tag.kind === 'record_factors')
  ) {
    expect(nextActive?.epochSeen ?? -1, where).toBeGreaterThanOrEqual(epoch);
  }
  if (ok && (tag.kind === 'grant_step_up' || tag.kind === 'consume_step_up')) {
    expect(baseActive?.epochSeen ?? -1, where).toBeGreaterThanOrEqual(epoch);
  }

  // A grant is consumed at most once, only under its sid and gen, for its act.
  const spent =
    (tag.kind === 'consume_step_up' || tag.kind === 'record_factors') && ok;
  for (const [id, grant] of Object.entries(base.grants)) {
    const after = next.grants[id];
    if (grant.consumedBy !== undefined) {
      if (after) expect(after.consumedBy, where).toBe(grant.consumedBy);
      continue;
    }
    const consumedNow =
      after?.consumedBy !== undefined ||
      (spent && 'grantId' in tag && tag.grantId === id);
    if (!consumedNow) continue;
    expect(spent, `${where} consumed ${id}`).toBe(true);
    if (!('grantId' in tag) || !('route' in tag))
      throw new Error('unreachable');
    expect(tag.grantId, where).toBe(id);
    expect(grant.sid, where).toBe(base.activeSid);
    expect(grant.gen, where).toBe(base.gen);
    const declared = REGISTRY.get(tag.route);
    expect('stepUp' in declared ? declared.stepUp.act : null, where).toBe(
      grant.act
    );
    if (after) expect(after.consumedBy, where).toBe(tag.operationId);
  }
  for (const [id, grant] of Object.entries(next.grants)) {
    if (Object.hasOwn(base.grants, id)) continue;
    expect(tag.kind, where).toBe('grant_step_up');
    expect(grant.sid, where).toBe(next.activeSid);
    expect(grant.gen, where).toBe(next.gen);
  }
}

/** One commit call: a write that landed is never reported unavailable. */
function checkCommit(entry: CommitRecord) {
  const { mutation, outcome, applied } = entry;
  const where = `${mutation.kind} ${mutation.operationId}`;
  if (applied.length === 0) {
    if (!outcome.result.ok && outcome.result.reason === 'unavailable') {
      expect(outcome.effects, where).toEqual([]);
    }
    return;
  }
  expect(
    outcome.result.ok || outcome.result.reason !== 'unavailable',
    `${where} lost ack`
  ).toBe(true);
  if (REVOCATIONS.has(mutation.kind)) {
    expect(outcome.result.ok, where).toBe(true);
    return;
  }
  const write = applied.find(
    (candidate) =>
      Object.hasOwn(candidate.next.operations, mutation.operationId) &&
      !Object.hasOwn(candidate.base.operations, mutation.operationId)
  );
  const stored = write?.next.operations[mutation.operationId];
  expect(stored, where).toBeDefined();
  expect(outcome.result, where).toEqual(stored?.result);
  expect(
    outcome.effects.map((effect) => effect.type),
    where
  ).toEqual(stored?.effects.map((effect) => effect.type));
}

/** A committed sign-in is confirmed in the index; a failed one never leaves its victim evicted. */
/**
 * The index after a sign-in settled: a committed sign-in is confirmed under
 * its slot, and a swap victim stays evicted and receives its slot revoke once
 * any sign-in was admitted under the slot; a provisional slot always has an
 * unsettled claim; and the victim is restored once no sign-in was admitted
 * under its slot and no claim holds that slot.
 */
export function checkSignInIndex(model: Model, entry: CommitRecord) {
  const { mutation, reserved } = entry;
  if (mutation.kind !== 'sign_in' || !reserved) return;
  if (reserved.kind !== 'reserved' && reserved.kind !== 'swap') return;
  const state = model.memory.state;
  const { userId } = mutation.outcome;
  const reservationId = reserved.reservation.reservationId;
  const status = operationStatus(state, mutation.operationId);
  const slot = model.index.slotOf(userId, DEVICE_ID);
  const held = slot?.reservationId === reservationId;
  const where = `sign_in ${mutation.operationId} ${status}`;
  if (status === 'succeeded') {
    expect(held, where).toBe(true);
    expect(slot?.confirmed, where).toBe(true);
  }
  if (held && !slot?.confirmed) {
    expect(Object.keys(slot?.claims ?? {}).length, where).toBeGreaterThan(0);
  }
  if (reserved.kind !== 'swap') return;
  const admitted = Object.values(state.sessions).some(
    (row) => row.reservationId === reservationId
  );
  const victim = model.index.slotOf(userId, reserved.evictDeviceId);
  const restored = victim?.reservationId === reserved.evictReservationId;
  if (admitted) {
    expect(restored, `${where} victim restored`).toBe(false);
    // Some sign-in admitted under the slot carries the victim's slot revoke.
    const evicts = Object.values(state.operations).some(
      (record) =>
        record.result.ok &&
        record.effects.some(
          (effect) =>
            effect.type === 'index_confirm' &&
            effect.reservationId === reservationId
        ) &&
        record.effects.some(
          (effect) =>
            effect.type === 'evict_device' &&
            effect.reservationId === reserved.evictReservationId
        )
    );
    expect(evicts, `${where} victim never evicted`).toBe(true);
  } else if (held) {
    expect(slot?.confirmed, where).toBe(false);
  } else {
    expect(restored, `${where} victim kept evicted`).toBe(true);
    expect(
      model.index.tombstones.has(`${userId}|${reserved.evictDeviceId}`),
      where
    ).toBe(false);
  }
}

/** `resolve` never changes the state, its version or its record maps. */
export function checkResolve(
  model: Model,
  run: () => ResolveResult
): ResolveResult {
  const before = structuredClone(model.memory.state);
  const result = run();
  expect(model.memory.state).toEqual(before);
  return result;
}

export type Checker = {
  checked: number;
  commits: number;
  committedOps: Set<string>;
  hashes: Uint8Array[];
};

export function createChecker(): Checker {
  return { checked: 0, commits: 0, committedOps: new Set(), hashes: [] };
}

/** Checks everything that happened since the last call. */
export async function checkSince(model: Model, checker: Checker) {
  for (const write of model.applied.slice(checker.checked))
    checkWrite(write, checker.committedOps);
  checker.checked = model.applied.length;
  for (const entry of model.commits.slice(checker.commits)) checkCommit(entry);
  checker.commits = model.commits.length;
  for (const secret of model.secrets.slice(checker.hashes.length)) {
    checker.hashes.push(await testHashSecret(secret));
  }
  const state = model.memory.state;
  const current = checker.hashes.filter((hash) =>
    constantTimeEqual(hash, state.secretHash)
  );
  expect(current.length).toBeLessThanOrEqual(1);
  expect(Object.keys(state.operations).length).toBeLessThanOrEqual(MAX_RECORDS);
  expect(Object.keys(state.expiredOperations).length).toBeLessThanOrEqual(
    MAX_EXPIRED_IDS
  );
}
