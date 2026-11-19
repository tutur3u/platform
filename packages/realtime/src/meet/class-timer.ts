import type { MeetRealtimeTokenPayload } from './primitives';

export const CLASS_TIMER_MIN_MS = 60_000;
export const CLASS_TIMER_MAX_MS = 180 * 60_000;
export const CLASS_TIMER_PRESETS_MS = [
  60_000, 180_000, 300_000, 600_000,
] as const;
export const MEET_CLASS_COHOST_SCOPE = 'class:cohost';

export type ClassTimerStatus = 'running' | 'paused' | 'ended';

export type ClassTimer = {
  id: string;
  status: ClassTimerStatus;
  durationMs: number;
  remainingMs: number;
  endsAt?: string;
  updatedAt: string;
};

export type ClassTimerCommand = {
  action: 'start' | 'pause' | 'resume' | 'stop';
  durationMs?: number;
};

type TimerActor = Pick<MeetRealtimeTokenPayload, 'userId' | 'role' | 'scopes'>;

export function canStartClassTimer(actor: Pick<TimerActor, 'role' | 'scopes'>) {
  return (
    actor.role === 'host' || actor.scopes.includes(MEET_CLASS_COHOST_SCOPE)
  );
}

/** Pause, resume, and stop stay with the meeting host. */
export function canControlClassTimer(actor: Pick<TimerActor, 'role'>) {
  return actor.role === 'host';
}

export function meetClassRole(
  actor: Pick<TimerActor, 'role' | 'scopes'>
): 'host' | 'cohost' | 'participant' {
  if (actor.role === 'host') return 'host';
  if (actor.scopes.includes(MEET_CLASS_COHOST_SCOPE)) return 'cohost';
  return 'participant';
}

export function canViewClassAttendance(
  actor: Pick<TimerActor, 'role' | 'scopes'>
) {
  return canStartClassTimer(actor);
}

export function presentClassTimer(
  timer: ClassTimer | null | undefined,
  now: string
): ClassTimer | null {
  if (!timer) return null;
  if (timer.status !== 'running' || !timer.endsAt) return timer;
  const remaining = Date.parse(timer.endsAt) - Date.parse(now);
  if (!Number.isFinite(remaining)) return timer;
  if (remaining > 0) {
    return remaining === timer.remainingMs
      ? timer
      : { ...timer, remainingMs: remaining };
  }
  return {
    ...timer,
    status: 'ended',
    remainingMs: 0,
    endsAt: undefined,
    updatedAt: now,
  };
}

export function classTimerServerMessage(
  timer: ClassTimer | null,
  serverNow: string
) {
  return { type: 'classTimer' as const, timer, serverNow };
}

export function applyClassTimerCommand(
  timer: ClassTimer | null | undefined,
  command: ClassTimerCommand,
  actor: TimerActor,
  now: string
): { ok: true; timer: ClassTimer | null } | { ok: false; error: string } {
  const current = presentClassTimer(timer, now);
  if (command.action === 'start') {
    if (!canStartClassTimer(actor))
      return { ok: false, error: 'permission_denied' };
    const durationMs = command.durationMs;
    if (
      !Number.isInteger(durationMs) ||
      durationMs === undefined ||
      durationMs < CLASS_TIMER_MIN_MS ||
      durationMs > CLASS_TIMER_MAX_MS
    )
      return { ok: false, error: 'invalid_duration' };
    return {
      ok: true,
      timer: {
        id: `${actor.userId}:${now}:${durationMs}`,
        status: 'running',
        durationMs,
        remainingMs: durationMs,
        endsAt: new Date(Date.parse(now) + durationMs).toISOString(),
        updatedAt: now,
      },
    };
  }
  if (!canControlClassTimer(actor))
    return { ok: false, error: 'permission_denied' };
  if (command.action === 'stop') return { ok: true, timer: null };
  if (command.action === 'pause') {
    if (!current || current.status !== 'running')
      return { ok: true, timer: current };
    if (current.remainingMs <= 0) {
      return {
        ok: true,
        timer: {
          ...current,
          status: 'ended',
          remainingMs: 0,
          endsAt: undefined,
          updatedAt: now,
        },
      };
    }
    return {
      ok: true,
      timer: {
        ...current,
        status: 'paused',
        remainingMs: current.remainingMs,
        endsAt: undefined,
        updatedAt: now,
      },
    };
  }
  if (!current || current.status !== 'paused' || current.remainingMs <= 0)
    return { ok: true, timer: current };
  return {
    ok: true,
    timer: {
      ...current,
      status: 'running',
      endsAt: new Date(Date.parse(now) + current.remainingMs).toISOString(),
      updatedAt: now,
    },
  };
}

/** Ceil to the next second. Hours use h:mm:ss; shorter timers use mm:ss. */
export function formatClassTimer(remainingMs: number) {
  const total = Math.max(0, Math.ceil(remainingMs / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const clock = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return hours > 0 ? `${hours}:${clock}` : clock;
}
