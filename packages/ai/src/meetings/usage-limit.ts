/**
 * Fail-closed per-user Meet AI usage limiter.
 *
 * Every paid Meet AI admission (live chunk transcription, notes finalization,
 * web recording transcription) charges server-bound actor, meeting and
 * workspace windows in the Durable Object abuse-guard store (`meet` family)
 * before any chunk row, credit check or provider call. A denial is a 429. A
 * missing, unassigned, misconfigured or failing store is a 503: this limiter
 * never falls back to Upstash, to per-isolate counting or to "allow".
 *
 * Keys are never read from client input: callers pass the verified session
 * user id, the meeting id they already looked up for the workspace, and the
 * meeting's billing workspace id. The abuse-guard client HMAC-hashes every
 * partition and key, so no raw id reaches Cloudflare.
 */
import {
  AbuseGuardUnavailableError,
  type GuardWindowInput,
  type GuardWindowSubject,
} from '@tuturuuu/utils/abuse-guard/client';
import { createExpiringMap } from '@tuturuuu/utils/abuse-guard/local-cache';
import type { AbuseGuardSelection } from '@tuturuuu/utils/abuse-guard/select';

export type MeetAiUsageKind = 'chunk' | 'notes' | 'recording';

export type MeetAiUsageInput = {
  kind: MeetAiUsageKind;
  /** Verified session user id (members and admitted guests alike). */
  userId: string;
  /** Meeting id after the workspace-scoped meeting lookup. */
  meetingId: string;
  /** The meeting's billing workspace (`workspace_meetings.ws_id`). */
  workspaceId: string;
  /** Server-computed audio seconds; required for `chunk` and `recording`. */
  audioSeconds?: number;
};

export type MeetAiLimitScope = 'user' | 'meeting' | 'workspace';

export const MEET_AI_RATE_LIMITED = 'MEET_AI_RATE_LIMITED';
export const MEET_AI_LIMITER_UNAVAILABLE = 'MEET_AI_LIMITER_UNAVAILABLE';
export const MEET_AI_LIMITER_RETRY_AFTER_SECONDS = 30;

export type MeetAiUsageDecision =
  | { ok: true }
  | {
      ok: false;
      status: 429;
      code: typeof MEET_AI_RATE_LIMITED;
      retryAfterSeconds: number;
      scope: MeetAiLimitScope;
    }
  | {
      ok: false;
      status: 503;
      code: typeof MEET_AI_LIMITER_UNAVAILABLE;
      retryAfterSeconds: number;
      reason: string;
    };

/** Conservative defaults; each one can be overridden by its env name. */
export const MEET_AI_LIMIT_DEFAULTS = {
  userMeetingRequestsPerMinute: 20,
  userMeetingAudioSecondsPer10Min: 1_800,
  userAudioSecondsPerDay: 28_800,
  meetingAudioSecondsPer10Min: 3_600,
  meetingAudioSecondsPerDay: 43_200,
  workspaceAudioSecondsPerDay: 144_000,
  userMeetingNotesPerHour: 6,
  meetingNotesPerHour: 12,
  workspaceNotesPerDay: 500,
} as const;

export type MeetAiLimits = Record<keyof typeof MEET_AI_LIMIT_DEFAULTS, number>;

export const MEET_AI_LIMIT_ENV: Record<keyof MeetAiLimits, string> = {
  userMeetingRequestsPerMinute:
    'MEET_AI_LIMIT_USER_MEETING_REQUESTS_PER_MINUTE',
  userMeetingAudioSecondsPer10Min:
    'MEET_AI_LIMIT_USER_MEETING_AUDIO_SECONDS_PER_10_MIN',
  userAudioSecondsPerDay: 'MEET_AI_LIMIT_USER_AUDIO_SECONDS_PER_DAY',
  meetingAudioSecondsPer10Min: 'MEET_AI_LIMIT_MEETING_AUDIO_SECONDS_PER_10_MIN',
  meetingAudioSecondsPerDay: 'MEET_AI_LIMIT_MEETING_AUDIO_SECONDS_PER_DAY',
  workspaceAudioSecondsPerDay: 'MEET_AI_LIMIT_WORKSPACE_AUDIO_SECONDS_PER_DAY',
  userMeetingNotesPerHour: 'MEET_AI_LIMIT_USER_MEETING_NOTES_PER_HOUR',
  meetingNotesPerHour: 'MEET_AI_LIMIT_MEETING_NOTES_PER_HOUR',
  workspaceNotesPerDay: 'MEET_AI_LIMIT_WORKSPACE_NOTES_PER_DAY',
};

/** Same bound as the store's `maxLimit`. */
const MAX_LIMIT = 1_000_000;
const MINUTE_MS = 60_000;
const TEN_MINUTES_MS = 10 * MINUTE_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
/** Web recordings: 16 kbit/s, below typical Opus/AAC, so it over-estimates. */
export const RECORDING_ESTIMATE_BYTES_PER_SECOND = 2_000;
/** A locally cached denial is rechecked against the store at least this often. */
const DENIAL_CACHE_MAX_MS = MINUTE_MS;

const warnedOverrides = new Set<string>();

export type MeetAiLimitEnv = Record<string, unknown> | undefined | null;

/**
 * Positive integers `1..1,000,000` override a default. Anything else keeps
 * the default (never "unlimited") and is reported once per process.
 */
export function resolveMeetAiLimits(env: MeetAiLimitEnv): MeetAiLimits {
  const limits = { ...MEET_AI_LIMIT_DEFAULTS } as MeetAiLimits;
  for (const key of Object.keys(MEET_AI_LIMIT_ENV) as (keyof MeetAiLimits)[]) {
    const name = MEET_AI_LIMIT_ENV[key];
    const raw = env?.[name];
    if (raw === undefined || raw === null || raw === '') continue;
    const text = typeof raw === 'string' ? raw.trim() : '';
    const value = /^\d{1,7}$/u.test(text) ? Number(text) : Number.NaN;
    if (Number.isSafeInteger(value) && value >= 1 && value <= MAX_LIMIT) {
      limits[key] = value;
    } else if (!warnedOverrides.has(name)) {
      warnedOverrides.add(name);
      console.warn(
        `[meet-ai-limit] ignoring invalid ${name}; keeping the default`
      );
    }
  }
  return limits;
}

/** Audio seconds as a whole store cost (at least one unit). */
export function audioCost(seconds: number) {
  return Math.min(MAX_LIMIT, Math.max(1, Math.ceil(seconds)));
}

/** Conservative audio duration for an encoded web recording. */
export function estimateRecordingSeconds(bytes: number) {
  return Math.ceil(Math.max(0, bytes) / RECORDING_ESTIMATE_BYTES_PER_SECOND);
}

const window = (
  key: string,
  limit: number,
  windowMs: number,
  cost = 1
): GuardWindowInput => ({
  key,
  limit,
  windowMs,
  algo: 'fixed',
  ...(cost === 1 ? {} : { cost }),
});

/**
 * Narrowest scope first: actor, then meeting, then workspace. The store
 * charges each subject all-or-nothing and stops at the first denial, so an
 * actor at their own cap never spends shared meeting or workspace budget.
 */
export function planMeetAiUsageWindows(
  input: MeetAiUsageInput,
  limits: MeetAiLimits
): GuardWindowSubject[] {
  const { kind, userId, meetingId, workspaceId } = input;
  const actor = `actor:${userId}`;
  const meeting = `meeting:${meetingId}`;
  const workspace = `workspace:${workspaceId}`;
  if (kind === 'notes') {
    return [
      {
        partition: actor,
        windows: [
          window(
            `notes:${meetingId}:1h`,
            limits.userMeetingNotesPerHour,
            HOUR_MS
          ),
        ],
      },
      {
        partition: meeting,
        windows: [window('notes:1h', limits.meetingNotesPerHour, HOUR_MS)],
      },
      {
        partition: workspace,
        windows: [window('notes:1d', limits.workspaceNotesPerDay, DAY_MS)],
      },
    ];
  }
  const cost = audioCost(input.audioSeconds ?? 0);
  if (kind === 'recording') {
    // One recording can exceed any 10-minute budget; only daily audio counts.
    return [
      {
        partition: actor,
        windows: [
          window(
            `recording:${meetingId}:1m`,
            limits.userMeetingRequestsPerMinute,
            MINUTE_MS
          ),
          window('audio:1d', limits.userAudioSecondsPerDay, DAY_MS, cost),
        ],
      },
      {
        partition: meeting,
        windows: [
          window('audio:1d', limits.meetingAudioSecondsPerDay, DAY_MS, cost),
        ],
      },
      {
        partition: workspace,
        windows: [
          window('audio:1d', limits.workspaceAudioSecondsPerDay, DAY_MS, cost),
        ],
      },
    ];
  }
  return [
    {
      partition: actor,
      windows: [
        window(
          `chunk:${meetingId}:1m`,
          limits.userMeetingRequestsPerMinute,
          MINUTE_MS
        ),
        window(
          `audio:${meetingId}:10m`,
          limits.userMeetingAudioSecondsPer10Min,
          TEN_MINUTES_MS,
          cost
        ),
        window('audio:1d', limits.userAudioSecondsPerDay, DAY_MS, cost),
      ],
    },
    {
      partition: meeting,
      windows: [
        window(
          'audio:10m',
          limits.meetingAudioSecondsPer10Min,
          TEN_MINUTES_MS,
          cost
        ),
        window('audio:1d', limits.meetingAudioSecondsPerDay, DAY_MS, cost),
      ],
    },
    {
      partition: workspace,
      windows: [
        window('audio:1d', limits.workspaceAudioSecondsPerDay, DAY_MS, cost),
      ],
    },
  ];
}

const SCOPES: MeetAiLimitScope[] = ['user', 'meeting', 'workspace'];

/**
 * Per-isolate denial cache: a denied actor is refused locally until the
 * reported reset (at most one minute), so a client hammering a 429 cannot
 * spend the `meet` family's shared daily operation budget. It only ever
 * denies; an allow always comes from the store.
 */
let deniedActors = createExpiringMap<number>(10_000);

/** Test hook: forget locally cached denials. */
export function resetMeetAiUsageLimiterCache() {
  deniedActors = createExpiringMap<number>(10_000);
}

function unavailable(reason: string): MeetAiUsageDecision {
  console.error('[meet-ai-limit] unavailable', { reason });
  return {
    ok: false,
    status: 503,
    code: MEET_AI_LIMITER_UNAVAILABLE,
    retryAfterSeconds: MEET_AI_LIMITER_RETRY_AFTER_SECONDS,
    reason,
  };
}

function validInput(input: MeetAiUsageInput) {
  const ids = [input.userId, input.meetingId, input.workspaceId];
  if (ids.some((id) => typeof id !== 'string' || !id.trim())) return false;
  if (input.kind === 'notes') return true;
  return (
    typeof input.audioSeconds === 'number' &&
    Number.isFinite(input.audioSeconds) &&
    input.audioSeconds > 0
  );
}

/**
 * Charges one Meet AI admission. Resolves to a decision and never throws:
 * every failure is a 503 refusal.
 */
export async function checkMeetAiUsage(
  input: MeetAiUsageInput,
  options: {
    selection: AbuseGuardSelection;
    env?: MeetAiLimitEnv;
    now?: () => number;
  }
): Promise<MeetAiUsageDecision> {
  const now = options.now ?? Date.now;
  try {
    if (!validInput(input)) return unavailable('invalid_input');
    const { selection } = options;
    if (selection.kind !== 'durable-object') return unavailable(selection.kind);
    if (selection.client.family !== 'meet') return unavailable('wrong_family');

    const cacheKey = `${input.kind}:${input.userId}:${input.meetingId}`;
    const cachedReset = deniedActors.get(cacheKey, now());
    if (cachedReset !== undefined) {
      return {
        ok: false,
        status: 429,
        code: MEET_AI_RATE_LIMITED,
        retryAfterSeconds: Math.max(1, Math.ceil((cachedReset - now()) / 1000)),
        scope: 'user',
      };
    }

    const limits = resolveMeetAiLimits(options.env);
    const outcome = await selection.client.hitWindows(
      planMeetAiUsageWindows(input, limits)
    );
    if (outcome.ok) return { ok: true };

    const at = now();
    const scope = SCOPES[outcome.subjectIndex] ?? 'workspace';
    const deniedWindow = outcome.windows.findIndex(
      (state) => state.remaining === 0
    );
    console.warn('[meet-ai-limit] denied', {
      kind: input.kind,
      scope,
      window: deniedWindow,
    });
    const resetAt = Math.max(at + 1000, outcome.resetAt);
    deniedActors.set(
      cacheKey,
      resetAt,
      Math.min(resetAt, at + DENIAL_CACHE_MAX_MS)
    );
    return {
      ok: false,
      status: 429,
      code: MEET_AI_RATE_LIMITED,
      retryAfterSeconds: Math.max(1, Math.ceil((resetAt - at) / 1000)),
      scope,
    };
  } catch (error) {
    return unavailable(
      error instanceof AbuseGuardUnavailableError ? error.code : 'error'
    );
  }
}
