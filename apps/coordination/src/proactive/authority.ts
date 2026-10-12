import {
  type Authority,
  type AuthoritySnapshot,
  authoritySnapshotSchema,
  type DueJob,
  type Identity,
  MAX_RUNS,
  MIN_CADENCE_MS,
} from './contracts';

export const unavailableAuthority: Authority = {
  async read() {
    return { kind: 'denied', reason: 'authority-unqualified' };
  },
};

export async function readAuthority(
  authority: Authority,
  identity: Identity,
  now: number
): Promise<AuthoritySnapshot> {
  try {
    const snapshot: unknown = await authority.read(identity, now);
    const parsed = authoritySnapshotSchema.safeParse(snapshot);
    return parsed.success
      ? parsed.data
      : { kind: 'denied', reason: 'authority-unqualified' };
  } catch {
    return { kind: 'denied', reason: 'authority-unavailable' };
  }
}

export function admissionReason(
  job: DueJob,
  snapshot: AuthoritySnapshot,
  now: number,
  runs: number
): string | null {
  if (snapshot.kind === 'denied') return snapshot.reason;
  const consent = snapshot.consent;
  if (
    !Number.isSafeInteger(snapshot.checkedAt) ||
    !Number.isSafeInteger(snapshot.validUntil) ||
    snapshot.checkedAt > now ||
    now - snapshot.checkedAt > 5_000 ||
    snapshot.validUntil <= now
  )
    return 'authority-stale';
  if (snapshot.paid !== true) return 'paid-required';
  if (
    consent.actorId !== job.actorId ||
    consent.workspaceId !== job.workspaceId ||
    consent.creatorId !== job.actorId ||
    consent.personal !== true
  )
    return 'personal-owner-required';
  if (consent.enabled !== true || consent.paused !== false)
    return 'consent-disabled';
  if (
    consent.version !== job.consentVersion ||
    consent.sourceVersion !== job.sourceVersion
  )
    return 'revision-conflict';
  if (
    !Number.isSafeInteger(consent.cadenceMs) ||
    consent.cadenceMs < MIN_CADENCE_MS ||
    (consent.previousDueAt !== null &&
      (!Number.isSafeInteger(consent.previousDueAt) ||
        job.dueAt - consent.previousDueAt < consent.cadenceMs))
  )
    return 'cadence-denied';
  if (
    !Number.isSafeInteger(consent.maxRuns) ||
    consent.maxRuns < 1 ||
    consent.maxRuns > MAX_RUNS ||
    runs >= consent.maxRuns ||
    !Number.isSafeInteger(consent.remainingUnits) ||
    consent.remainingUnits < 1
  )
    return 'budget-exhausted';
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: consent.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const minute =
      Number(parts.find((part) => part.type === 'hour')?.value) * 60 +
      Number(parts.find((part) => part.type === 'minute')?.value);
    const quiet = consent.quietHours;
    if (quiet) {
      if (
        !Number.isInteger(quiet.startMinute) ||
        !Number.isInteger(quiet.endMinute) ||
        quiet.startMinute < 0 ||
        quiet.endMinute < 0 ||
        quiet.startMinute >= 1440 ||
        quiet.endMinute >= 1440 ||
        quiet.startMinute === quiet.endMinute
      )
        return 'quiet-hours-invalid';
      const inside =
        quiet.startMinute < quiet.endMinute
          ? minute >= quiet.startMinute && minute < quiet.endMinute
          : minute >= quiet.startMinute || minute < quiet.endMinute;
      if (inside) return 'quiet-hours';
    }
  } catch {
    return 'timezone-invalid';
  }
  return null;
}
