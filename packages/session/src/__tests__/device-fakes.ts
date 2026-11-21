/** In-memory port doubles for the device state machine. Test-only by path. */
import { mintAllowed, touchedSession, type ReserveOutcome } from '../device';
import { emptyDeviceState } from '../device/sessions';
import { mergeEpochCache, refreshRaise } from '../device/epoch';
import type {
  DeviceState,
  DeviceStore,
  EpochCache,
  EpochRaise,
  IssuerId,
  ReservationClaim,
  SessionCredentialIssuer,
  UserIndexPort,
  WriteOutcome,
} from '../device';
import type { UserId } from '../principal';

/** mulberry32: a small deterministic PRNG for property tests. */
export function seededRandom(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (bound: number) => Math.floor(next() * bound),
    bool: (probability = 0.5) => next() < probability,
    pick: <T>(items: readonly T[]): T =>
      items[Math.floor(next() * items.length)] as T,
  };
}
export type Random = ReturnType<typeof seededRandom>;

export function seededEntropy(random: Random) {
  return (length: number) => {
    const bytes = new Uint8Array(length);
    for (let index = 0; index < length; index += 1)
      bytes[index] = random.int(256);
    return bytes;
  };
}

/** A keyed hash stand-in for HMAC(pepper, secret): SHA-256 over a fixed prefix. */
export async function testHashSecret(secret: Uint8Array): Promise<Uint8Array> {
  const input = new Uint8Array(secret.length + 4);
  input.set([0x74, 0x74, 0x72, 0x7c]);
  input.set(secret, 4);
  return new Uint8Array(await crypto.subtle.digest('SHA-256', input));
}

/**
 * `conflict` reports a conflict without writing; `unknown_committed` writes
 * and loses the acknowledgement; `unknown_lost` writes nothing and reports
 * `unknown`; `throw` throws without writing.
 */
export type WriteFault =
  | 'conflict'
  | 'unknown_committed'
  | 'unknown_lost'
  | 'throw';

export type CommittedWrite = {
  expectedVersion: number;
  base: DeviceState;
  next: DeviceState;
  raises: EpochRaise[];
  fault: WriteFault | null;
};

export function createMemoryStore(initial: DeviceState = emptyDeviceState()) {
  let state = structuredClone(initial);
  let cache: EpochCache = {};
  const faults: WriteFault[] = [];
  const committed: CommittedWrite[] = [];
  let nextFault: (() => WriteFault | null) | null = null;
  let concurrent: ((state: DeviceState) => DeviceState | null) | null = null;
  const store: DeviceStore = {
    async read() {
      return structuredClone(state);
    },
    async write(expectedVersion, next, raises): Promise<WriteOutcome> {
      const fault = faults.shift() ?? nextFault?.() ?? null;
      if (fault === 'throw') throw new Error('storage error');
      if (fault === 'conflict') return 'conflict';
      if (fault === 'unknown_lost') return 'unknown';
      if (concurrent) {
        const moved = concurrent(state);
        if (moved) state = moved;
      }
      if (state.version !== expectedVersion) return 'conflict';
      if (
        next.version !== expectedVersion + 1 &&
        next.version !== expectedVersion
      ) {
        throw new Error('write must advance the version by at most one');
      }
      committed.push({
        expectedVersion,
        base: structuredClone(state),
        next: structuredClone(next),
        raises: structuredClone(raises),
        fault,
      });
      state = structuredClone(next);
      cache = mergeEpochCache(cache, raises);
      return fault === 'unknown_committed' ? 'unknown' : 'committed';
    },
    async readEpochCache() {
      return structuredClone(cache);
    },
    async touch(sessionId, lastSeenAtMs) {
      const touched = touchedSession(state, sessionId, lastSeenAtMs);
      if (touched)
        state = {
          ...state,
          sessions: { ...state.sessions, [sessionId]: touched },
        };
    },
    async refreshEpochCache(read, nowMs) {
      const raise = refreshRaise(read, nowMs);
      if (raise) cache = mergeEpochCache(cache, [raise]);
    },
  };
  return {
    store,
    faults,
    committed,
    get state() {
      return state;
    },
    set state(value: DeviceState) {
      state = structuredClone(value);
    },
    get cache() {
      return cache;
    },
    setCache(value: EpochCache) {
      cache = structuredClone(value);
    },
    /** Called before each write to decide a fault; queued faults win. */
    onWrite(decide: (() => WriteFault | null) | null) {
      nextFault = decide;
    },
    /** Lets another writer move the state just before a write lands. */
    interleave(change: ((state: DeviceState) => DeviceState | null) | null) {
      concurrent = change;
    },
  };
}
export type MemoryStore = ReturnType<typeof createMemoryStore>;

export type IndexSlot = {
  reservationId: string;
  confirmed: boolean;
  lastSeenAt: number;
  /** Unsettled reserves per operation id. */
  claims: Record<string, number>;
  /** The device a provisional swap evicted, restored if the slot is dropped. */
  victim: { deviceId: string; slot: IndexSlot } | null;
};

/**
 * A user index with a cap, swap eviction, tombstones and per-slot claims: a
 * release settles one claim of its operation and drops the slot, restoring
 * its victim, only when that was the last claim on an unconfirmed slot.
 */
export function createUserIndex(mintId: () => string) {
  const slots = new Map<UserId, Map<string, IndexSlot>>();
  const tombstones = new Map<
    string,
    { userId: UserId; deviceId: string; slot: IndexSlot }
  >();
  const owners = new Map<string, { userId: UserId; deviceId: string }>();
  const userSlots = (userId: UserId) => {
    let map = slots.get(userId);
    if (!map) slots.set(userId, (map = new Map()));
    return map;
  };
  const tombstoneKey = (userId: string, deviceId: string) =>
    `${userId}|${deviceId}`;
  const slotFor = (reservationId: string) => {
    const owner = owners.get(reservationId);
    const slot = owner && slots.get(owner.userId)?.get(owner.deviceId);
    return owner && slot?.reservationId === reservationId
      ? { ...owner, slot }
      : null;
  };
  /** Settles one claim of `operationId`; false when it held none. */
  const settle = (slot: IndexSlot, operationId: string) => {
    const held = Object.hasOwn(slot.claims, operationId)
      ? (slot.claims[operationId] as number)
      : 0;
    if (held === 0) return false;
    if (held === 1) delete slot.claims[operationId];
    else slot.claims[operationId] = held - 1;
    return true;
  };
  const reservedOf = (
    slot: IndexSlot
  ): Extract<ReserveOutcome, { kind: 'reserved' | 'swap' }> =>
    slot.victim
      ? {
          kind: 'swap',
          reservation: { reservationId: slot.reservationId },
          evictDeviceId: slot.victim.deviceId,
          evictReservationId: slot.victim.slot.reservationId,
        }
      : {
          kind: 'reserved',
          reservation: { reservationId: slot.reservationId },
        };
  let available = true;
  const port: UserIndexPort = {
    async reserve({
      userId,
      deviceId,
      operationId,
      cap,
      nowMs,
    }): Promise<ReserveOutcome> {
      if (!available) return { kind: 'unavailable' };
      if (tombstones.has(tombstoneKey(userId, deviceId)))
        return { kind: 'evicting' };
      const map = userSlots(userId);
      const existing = map.get(deviceId);
      if (existing) {
        existing.lastSeenAt = nowMs;
        existing.claims[operationId] = (existing.claims[operationId] ?? 0) + 1;
        owners.set(existing.reservationId, { userId, deviceId });
        return reservedOf(existing);
      }
      const slot: IndexSlot = {
        reservationId: mintId(),
        confirmed: false,
        lastSeenAt: nowMs,
        claims: { [operationId]: 1 },
        victim: null,
      };
      if (map.size >= cap) {
        const victims = [...map.entries()].filter(
          ([, other]) => other.confirmed
        );
        if (victims.length === 0) return { kind: 'unavailable' };
        victims.sort((left, right) => left[1].lastSeenAt - right[1].lastSeenAt);
        const [victimDevice, victimSlot] = victims[0] as [string, IndexSlot];
        map.delete(victimDevice);
        tombstones.set(tombstoneKey(userId, victimDevice), {
          userId,
          deviceId: victimDevice,
          slot: victimSlot,
        });
        slot.victim = { deviceId: victimDevice, slot: victimSlot };
      }
      map.set(deviceId, slot);
      owners.set(slot.reservationId, { userId, deviceId });
      return reservedOf(slot);
    },
    async confirm({ reservationId, operationId }: ReservationClaim) {
      const found = slotFor(reservationId);
      if (!found) return;
      settle(found.slot, operationId);
      found.slot.confirmed = true;
      found.slot.victim = null;
    },
    async release({ reservationId, operationId }: ReservationClaim) {
      const found = slotFor(reservationId);
      if (!found || !settle(found.slot, operationId)) return;
      const { slot, userId, deviceId } = found;
      if (slot.confirmed || Object.keys(slot.claims).length > 0) return;
      const map = userSlots(userId);
      map.delete(deviceId);
      owners.delete(reservationId);
      if (slot.victim) {
        map.set(slot.victim.deviceId, slot.victim.slot);
        tombstones.delete(tombstoneKey(userId, slot.victim.deviceId));
      }
    },
  };
  return {
    port,
    slots,
    tombstones,
    setAvailable(value: boolean) {
      available = value;
    },
    /** The evicted device acknowledged its slot revoke. */
    ackEviction(userId: UserId, deviceId: string) {
      tombstones.delete(tombstoneKey(userId, deviceId));
    },
    slotOf(userId: UserId, deviceId: string) {
      return slots.get(userId)?.get(deviceId) ?? null;
    },
  };
}

export type FakeCredential = { id: string; sid: string };

/**
 * A credential store meeting the issuer contract: every method runs as one
 * synchronous critical section, the per-`sid` lock.
 */
export function createIssuer(id: IssuerId, now: () => number) {
  const credentials = new Map<
    string,
    { sid: string; resolvedAtMs: number; live: boolean }
  >();
  const tombstones = new Map<string, number>();
  const watermarks = new Map<string, number>();
  let failures = 0;
  const issuer: SessionCredentialIssuer<FakeCredential> = {
    id,
    async mint(sid, resolvedAtMs, credential) {
      const allowed = mintAllowed({
        tombstone: tombstones.has(sid),
        watermark: watermarks.get(sid) ?? null,
        resolvedAtMs,
        issuerNowMs: now(),
      });
      if (!allowed || credential.sid !== sid) return 'refused';
      credentials.set(credential.id, { sid, resolvedAtMs, live: true });
      return 'minted';
    },
    async revokeForSession(sid) {
      if (failures > 0) {
        failures -= 1;
        return 'failed';
      }
      if (!tombstones.has(sid)) tombstones.set(sid, now());
      for (const entry of credentials.values())
        if (entry.sid === sid) entry.live = false;
      return 'ok';
    },
    async revokeForSessionBefore(sid, changedAt) {
      if (failures > 0) {
        failures -= 1;
        return 'failed';
      }
      watermarks.set(sid, Math.max(watermarks.get(sid) ?? 0, changedAt));
      for (const entry of credentials.values()) {
        if (entry.sid === sid && entry.resolvedAtMs < changedAt)
          entry.live = false;
      }
      return 'ok';
    },
    async validate(credential) {
      const entry = credentials.get(credential.id);
      return !!entry && entry.live && !tombstones.has(entry.sid);
    },
  };
  return {
    issuer,
    tombstones,
    watermarks,
    failNext(count: number) {
      failures = count;
    },
  };
}

export function createUpstream() {
  let failures = 0;
  const revoked: Uint8Array[] = [];
  return {
    port: {
      async revokeUpstream(grant: { data: Uint8Array }) {
        if (failures > 0) {
          failures -= 1;
          return 'failed' as const;
        }
        revoked.push(grant.data);
        return 'ok' as const;
      },
    },
    revoked,
    failNext(count: number) {
      failures = count;
    },
    failAlways() {
      failures = Number.POSITIVE_INFINITY;
    },
  };
}
