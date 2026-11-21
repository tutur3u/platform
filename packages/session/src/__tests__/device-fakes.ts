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
  Reservation,
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

type Slot = {
  reservationId: string;
  confirmed: boolean;
  lastSeenAt: number;
  operationId: string;
};

/** A user index with a cap, swap eviction, tombstones and releases that restore a victim. */
export function createUserIndex(mintId: () => string) {
  const slots = new Map<UserId, Map<string, Slot>>();
  const tombstones = new Map<
    string,
    { userId: UserId; deviceId: string; slot: Slot }
  >();
  const reservations = new Map<
    string,
    {
      userId: UserId;
      deviceId: string;
      victim: { deviceId: string; slot: Slot } | null;
    }
  >();
  const userSlots = (userId: UserId) => {
    let map = slots.get(userId);
    if (!map) slots.set(userId, (map = new Map()));
    return map;
  };
  const tombstoneKey = (userId: string, deviceId: string) =>
    `${userId}|${deviceId}`;
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
        return {
          kind: 'reserved',
          reservation: { reservationId: existing.reservationId },
        };
      }
      const slot: Slot = {
        reservationId: mintId(),
        confirmed: false,
        lastSeenAt: nowMs,
        operationId,
      };
      if (map.size < cap) {
        map.set(deviceId, slot);
        reservations.set(slot.reservationId, {
          userId,
          deviceId,
          victim: null,
        });
        return {
          kind: 'reserved',
          reservation: { reservationId: slot.reservationId },
        };
      }
      const victims = [...map.entries()].filter(([, other]) => other.confirmed);
      if (victims.length === 0) return { kind: 'unavailable' };
      victims.sort((left, right) => left[1].lastSeenAt - right[1].lastSeenAt);
      const [victimDevice, victimSlot] = victims[0] as [string, Slot];
      map.delete(victimDevice);
      tombstones.set(tombstoneKey(userId, victimDevice), {
        userId,
        deviceId: victimDevice,
        slot: victimSlot,
      });
      map.set(deviceId, slot);
      reservations.set(slot.reservationId, {
        userId,
        deviceId,
        victim: { deviceId: victimDevice, slot: victimSlot },
      });
      return {
        kind: 'swap',
        reservation: { reservationId: slot.reservationId },
        evictDeviceId: victimDevice,
        evictReservationId: victimSlot.reservationId,
      };
    },
    async confirm(reservation: Reservation) {
      const entry = reservations.get(reservation.reservationId);
      const slot = entry && slots.get(entry.userId)?.get(entry.deviceId);
      if (slot && slot.reservationId === reservation.reservationId)
        slot.confirmed = true;
    },
    async release(reservation: Reservation) {
      const entry = reservations.get(reservation.reservationId);
      if (!entry) return;
      const map = userSlots(entry.userId);
      const slot = map.get(entry.deviceId);
      if (
        slot?.reservationId === reservation.reservationId &&
        !slot.confirmed
      ) {
        map.delete(entry.deviceId);
        if (entry.victim) {
          map.set(entry.victim.deviceId, entry.victim.slot);
          tombstones.delete(tombstoneKey(entry.userId, entry.victim.deviceId));
        }
      }
      reservations.delete(reservation.reservationId);
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
