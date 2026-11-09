declare const instantBrand: unique symbol;
declare const scheduleIdBrand: unique symbol;
declare const revisionBrand: unique symbol;
declare const claimTokenBrand: unique symbol;

export type Instant = number & { readonly [instantBrand]: true };
export type ScheduleId = string & { readonly [scheduleIdBrand]: true };
export type Revision = number & { readonly [revisionBrand]: true };
export type ClaimToken = string & { readonly [claimTokenBrand]: true };

export function instant(value: number): Instant {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      'An instant must be nonnegative safe epoch milliseconds'
    );
  }
  return value as Instant;
}

function validIdentifier(value: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,127}$/.test(value);
}

export function scheduleId(value: string): ScheduleId {
  if (!validIdentifier(value))
    throw new RangeError('Invalid schedule identifier');
  return value as ScheduleId;
}

export function claimToken(value: string): ClaimToken {
  if (!validIdentifier(value)) throw new RangeError('Invalid claim token');
  return value as ClaimToken;
}

export function revision(value: number): Revision {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError('A revision must be a positive safe integer');
  }
  return value as Revision;
}

export type Refusal =
  | 'flag_off'
  | 'paused'
  | 'disabled'
  | 'stop'
  | 'workspace'
  | 'agent'
  | 'recipient'
  | 'permission'
  | 'rate';

export type Eligibility =
  | { readonly kind: 'eligible' }
  | { readonly kind: 'refused'; readonly reason: Refusal };

export type Outcome =
  | { readonly kind: 'completed' }
  | { readonly kind: 'no_action' }
  | { readonly kind: 'unknown' }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'refused'; readonly reason: Refusal };

type Identity = {
  readonly scheduleId: ScheduleId;
  readonly scheduledFor: Instant;
  readonly revision: Revision;
};

export type Occurrence = Identity &
  (
    | { readonly kind: 'pending' }
    | {
        readonly kind: 'claimed';
        readonly token: ClaimToken;
        readonly deadline: Instant;
      }
    | { readonly kind: 'closed'; readonly outcome: Outcome }
  );

export function occurrenceKey(identity: Identity): string {
  return JSON.stringify([identity.scheduleId, identity.scheduledFor]);
}

export function pendingOccurrence(identity: Identity): Occurrence {
  return { ...identity, kind: 'pending' };
}

function close(occurrence: Occurrence, outcome: Outcome): Occurrence {
  return {
    scheduleId: occurrence.scheduleId,
    scheduledFor: occurrence.scheduledFor,
    revision: occurrence.revision,
    kind: 'closed',
    outcome,
  };
}

export type ClaimDecision =
  | {
      readonly kind: 'dispatch';
      readonly occurrence: Extract<Occurrence, { kind: 'claimed' }>;
    }
  | { readonly kind: 'idle'; readonly occurrence: Occurrence };

export function claimOccurrence(input: {
  occurrence: Occurrence;
  currentRevision: Revision;
  now: Instant;
  token: ClaimToken;
  budgetMs: number;
  eligibility: Eligibility;
}): ClaimDecision {
  const { occurrence, now } = input;
  if (occurrence.kind === 'closed') return { kind: 'idle', occurrence };
  if (occurrence.kind === 'claimed') {
    return {
      kind: 'idle',
      occurrence:
        now >= occurrence.deadline
          ? close(occurrence, { kind: 'unknown' })
          : occurrence,
    };
  }
  if (now < occurrence.scheduledFor) return { kind: 'idle', occurrence };
  if (occurrence.revision !== input.currentRevision) {
    return {
      kind: 'idle',
      occurrence: close(occurrence, { kind: 'cancelled' }),
    };
  }
  if (input.eligibility.kind === 'refused') {
    return { kind: 'idle', occurrence: close(occurrence, input.eligibility) };
  }
  if (
    !Number.isSafeInteger(input.budgetMs) ||
    input.budgetMs < 1 ||
    input.budgetMs > 60_000
  ) {
    throw new RangeError('An execution budget must be between 1 and 60000 ms');
  }
  return {
    kind: 'dispatch',
    occurrence: {
      ...occurrence,
      kind: 'claimed',
      token: input.token,
      deadline: instant(now + input.budgetMs),
    },
  };
}

export function recordOutcome(input: {
  occurrence: Occurrence;
  token: ClaimToken;
  now: Instant;
  outcome: Extract<Outcome, { kind: 'completed' | 'no_action' | 'unknown' }>;
}): Occurrence {
  const { occurrence } = input;
  if (occurrence.kind !== 'claimed' || occurrence.token !== input.token) {
    return occurrence;
  }
  return close(
    occurrence,
    input.now >= occurrence.deadline ? { kind: 'unknown' } : input.outcome
  );
}

export type PeriodSelection =
  | { readonly kind: 'exhausted' }
  | { readonly kind: 'future'; readonly nextDueAt: Instant }
  | {
      readonly kind: 'due';
      readonly scheduledFor: Instant;
      readonly missed: number;
      readonly nextDueAt: Instant | null;
    };

/** Select one catch-up from a bounded UTC window supplied by a calendar adapter. */
export function selectCalendarPeriod(input: {
  periods: readonly Instant[];
  now: Instant;
  closedThrough: Instant | null;
}): PeriodSelection {
  if (input.periods.length > 1_000) {
    throw new RangeError('A calendar window may contain at most 1000 periods');
  }
  let previous: Instant | null = null;
  let latestDue: Instant | null = null;
  let nextDueAt: Instant | null = null;
  let dueCount = 0;
  for (const period of input.periods) {
    if (previous !== null && period <= previous) {
      throw new RangeError('Calendar periods must be unique and increasing');
    }
    previous = period;
    if (input.closedThrough !== null && period <= input.closedThrough) continue;
    if (period <= input.now) {
      latestDue = period;
      dueCount++;
    } else if (nextDueAt === null) {
      nextDueAt = period;
    }
  }
  if (latestDue !== null) {
    return {
      kind: 'due',
      scheduledFor: latestDue,
      missed: dueCount - 1,
      nextDueAt,
    };
  }
  return nextDueAt === null
    ? { kind: 'exhausted' }
    : { kind: 'future', nextDueAt };
}

/** Heartbeats use elapsed intervals; local wall-clock/DST interpretation is separate. */
export function selectIntervalPeriod(input: {
  anchor: Instant;
  intervalMs: number;
  now: Instant;
  closedThrough: Instant | null;
}): PeriodSelection {
  if (!Number.isSafeInteger(input.intervalMs) || input.intervalMs < 1) {
    throw new RangeError('An interval must be a positive safe integer');
  }
  if (input.now < input.anchor) {
    return { kind: 'future', nextDueAt: input.anchor };
  }
  const latestIndex = Math.floor((input.now - input.anchor) / input.intervalMs);
  const firstOpenIndex =
    input.closedThrough === null || input.closedThrough < input.anchor
      ? 0
      : Math.floor((input.closedThrough - input.anchor) / input.intervalMs) + 1;
  if (firstOpenIndex > latestIndex) {
    return {
      kind: 'future',
      nextDueAt: instant(input.anchor + firstOpenIndex * input.intervalMs),
    };
  }
  return {
    kind: 'due',
    scheduledFor: instant(input.anchor + latestIndex * input.intervalMs),
    missed: latestIndex - firstOpenIndex,
    nextDueAt: instant(input.anchor + (latestIndex + 1) * input.intervalMs),
  };
}
