import { takeSnapshotActorLimit } from './actor-rate-limit';
import {
  closeAttendanceWhenCollectionStops,
  eraseAttendanceCopy,
  expireAttendanceIntervals,
} from './attendance-ledger';
import type { MeetClassFeatures } from './class-features';
import { applyClassTimerCommand, classTimerServerMessage } from './class-timer';
import type { MeetRealtimeServerMessage } from './messages';
import { accountRoomTime, expireRoomBudget } from './room-budget';
import type { MeetRoomSnapshot } from './room';
import type { MeetServiceClaims } from './service-credential';

export type MeetClassServiceResult = {
  snapshot: MeetRoomSnapshot;
  status: number;
  body: unknown;
  persist: boolean;
  broadcast: MeetRealtimeServerMessage[];
};

function unchanged(
  snapshot: MeetRoomSnapshot,
  status: number,
  body: unknown
): MeetClassServiceResult {
  return { snapshot, status, body, persist: false, broadcast: [] };
}

function sealedSnapshot(
  snapshot: MeetRoomSnapshot,
  features: MeetClassFeatures,
  now: string
) {
  const attendance = closeAttendanceWhenCollectionStops(
    snapshot.attendance,
    features.attendance,
    now
  );
  if (attendance === snapshot.attendance) return snapshot;
  return { ...snapshot, attendance: attendance ?? [] };
}

function limited(
  snapshot: MeetRoomSnapshot,
  kind: 'attendance' | 'timer',
  actorId: string,
  nowMs: number
): MeetClassServiceResult | { snapshot: MeetRoomSnapshot } {
  const decision = takeSnapshotActorLimit(
    snapshot.serviceLimits,
    kind,
    actorId,
    nowMs
  );
  const next = { ...snapshot, serviceLimits: decision.buckets };
  if (decision.ok) return { snapshot: next };
  return {
    snapshot: next,
    status: 429,
    body: { error: 'rate_limited' },
    persist: true,
    broadcast: [],
  };
}

function ledgerBody(snapshot: MeetRoomSnapshot) {
  return {
    attendance: snapshot.attendance ?? [],
    epoch: snapshot.attendanceEpoch ?? 0,
    ...(snapshot.endedAt ? { endedAt: snapshot.endedAt } : {}),
  };
}

export function applyMeetClassService(
  snapshot: MeetRoomSnapshot,
  claims: MeetServiceClaims,
  features: MeetClassFeatures,
  now: string,
  existed = true
): MeetClassServiceResult {
  if (claims.purpose === 'attendance-erase' && !existed)
    return {
      snapshot,
      status: 200,
      body: { ok: true, absent: true },
      persist: false,
      broadcast: [],
    };
  const current = sealedSnapshot(snapshot, features, now);
  const sealed = current !== snapshot;
  if (claims.purpose === 'attendance-ledger') {
    if (!features.attendance)
      return {
        snapshot: current,
        status: 404,
        body: null,
        persist: sealed,
        broadcast: [],
      };
    const gate = limited(
      current,
      'attendance',
      claims.actorUserId || claims.roomId,
      Date.parse(now)
    );
    if ('status' in gate) return gate;
    const expired = expireAttendanceIntervals(gate.snapshot.attendance, now);
    const next =
      expired === gate.snapshot.attendance
        ? gate.snapshot
        : { ...gate.snapshot, attendance: expired ?? [] };
    return {
      snapshot: next,
      status: 200,
      body: ledgerBody(next),
      persist: next !== snapshot,
      broadcast: [],
    };
  }
  if (claims.purpose === 'class-timer') {
    if (!features.timer)
      return {
        snapshot: current,
        status: 404,
        body: { error: 'unavailable' },
        persist: sealed,
        broadcast: [],
      };
    const nowMs = Date.parse(now);
    const accounted = accountRoomTime(current, nowMs);
    const expired = expireRoomBudget(accounted, nowMs, features);
    if (expired) {
      return {
        snapshot: expired.state,
        status: 403,
        body: { error: 'room.ended' },
        persist: true,
        broadcast: expired.broadcast,
      };
    }
    if (accounted.ended)
      return {
        snapshot: accounted,
        status: 403,
        body: { error: 'room.ended' },
        persist: accounted !== snapshot,
        broadcast: [],
      };
    const gate = limited(
      accounted,
      'timer',
      claims.actorUserId || claims.roomId,
      nowMs
    );
    if ('status' in gate) return gate;
    const applied = applyClassTimerCommand(
      gate.snapshot.classTimer,
      { action: claims.action ?? 'stop', durationMs: claims.durationMs },
      {
        userId: claims.actorUserId ?? '',
        role: claims.actorRole === 'host' ? 'host' : 'speaker',
        scopes: claims.actorRole === 'cohost' ? ['class:cohost'] : [],
      },
      now
    );
    if (!applied.ok)
      return {
        snapshot: gate.snapshot,
        status: 403,
        body: { error: applied.error },
        persist: gate.snapshot !== snapshot,
        broadcast: [],
      };
    const timerUnchanged =
      (gate.snapshot.classTimer ?? null) === (applied.timer ?? null);
    if (timerUnchanged)
      return {
        snapshot: gate.snapshot,
        status: 200,
        body: { ok: true },
        persist: gate.snapshot !== snapshot,
        broadcast: [],
      };
    const next = { ...gate.snapshot, classTimer: applied.timer };
    return {
      snapshot: next,
      status: 200,
      body: { ok: true },
      persist: true,
      broadcast: [classTimerServerMessage(applied.timer, now)],
    };
  }
  if (claims.purpose !== 'attendance-erase')
    return unchanged(current, 404, { error: 'unavailable' });
  const generation = claims.generation;
  if (!Number.isInteger(generation) || (generation ?? -1) < 0)
    return unchanged(current, 400, { error: 'generation' });
  const attendance = eraseAttendanceCopy(current.attendance, {
    all: claims.erase === 'meeting',
    userId: claims.userId,
    guestId: claims.guestId,
  });
  const epoch = current.attendanceEpoch ?? 0;
  const nextEpoch = Math.max(epoch, generation ?? epoch);
  const nextAttendance = attendance ?? [];
  const sameCopy =
    nextEpoch === epoch &&
    (attendance === current.attendance ||
      (nextAttendance.length === 0 && !(current.attendance ?? []).length));
  return {
    snapshot: {
      ...current,
      attendance: nextAttendance,
      attendanceEpoch: nextEpoch,
    },
    status: 200,
    body: { ok: true },
    persist: !sameCopy,
    broadcast: [],
  };
}
