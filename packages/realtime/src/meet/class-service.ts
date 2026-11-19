import {
  eraseAttendanceCopy,
  expireAttendanceIntervals,
} from './attendance-ledger';
import type { MeetClassFeatures } from './class-features';
import { applyClassTimerCommand, classTimerServerMessage } from './class-timer';
import type { MeetServiceClaims } from './service-credential';
import type { MeetRoomSnapshot } from './room';

export type MeetClassServiceResult = {
  snapshot: MeetRoomSnapshot;
  status: number;
  body: unknown;
  persist: boolean;
  broadcast: ReturnType<typeof classTimerServerMessage>[];
};

function unchanged(
  snapshot: MeetRoomSnapshot,
  status: number,
  body: unknown
): MeetClassServiceResult {
  return { snapshot, status, body, persist: false, broadcast: [] };
}

export function applyMeetClassService(
  snapshot: MeetRoomSnapshot,
  claims: MeetServiceClaims,
  features: MeetClassFeatures,
  now: string
): MeetClassServiceResult {
  if (claims.purpose === 'attendance-ledger') {
    if (!features.attendance) return unchanged(snapshot, 404, null);
    const expired = expireAttendanceIntervals(snapshot.attendance, now);
    if (expired === snapshot.attendance)
      return {
        snapshot,
        status: 200,
        body: { attendance: snapshot.attendance ?? [] },
        persist: false,
        broadcast: [],
      };
    const next = { ...snapshot, attendance: expired ?? [] };
    return {
      snapshot: next,
      status: 200,
      body: { attendance: next.attendance },
      persist: true,
      broadcast: [],
    };
  }
  if (claims.purpose === 'class-timer') {
    if (!features.timer)
      return unchanged(snapshot, 404, { error: 'unavailable' });
    const applied = applyClassTimerCommand(
      snapshot.classTimer,
      { action: claims.action ?? 'stop', durationMs: claims.durationMs },
      {
        userId: claims.actorUserId ?? '',
        role: claims.actorRole === 'host' ? 'host' : 'speaker',
        scopes: claims.actorRole === 'cohost' ? ['class:cohost'] : [],
      },
      now
    );
    if (!applied.ok) return unchanged(snapshot, 403, { error: applied.error });
    if ((snapshot.classTimer ?? null) === (applied.timer ?? null))
      return unchanged(snapshot, 200, { ok: true });
    const next = { ...snapshot, classTimer: applied.timer };
    return {
      snapshot: next,
      status: 200,
      body: { ok: true },
      persist: true,
      broadcast: [classTimerServerMessage(applied.timer, now)],
    };
  }
  const attendance = eraseAttendanceCopy(snapshot.attendance, {
    all: claims.erase === 'meeting',
    userId: claims.userId,
    guestId: claims.guestId,
  });
  if (attendance === snapshot.attendance)
    return unchanged(snapshot, 200, { ok: true });
  return {
    snapshot: { ...snapshot, attendance: attendance ?? [] },
    status: 200,
    body: { ok: true },
    persist: true,
    broadcast: [],
  };
}
