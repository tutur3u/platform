import type { MeetRoomSnapshot } from './room';
import {
  ackSelfOutbox,
  SELF_OUTBOX_FIRST_DELIVERY_MS,
  type SelfCaptureState,
} from './room-self-capture-state';
import {
  MEET_SERVICE_TTL_SECONDS,
  signMeetServiceCredential,
} from './service-credential';

/**
 * Alarm delivery of the per-speaker legal outbox to the Meet Worker, for
 * endings no request will drain (room end, leave, removal). It runs only when
 * the realtime Worker has the `MEET_AI_SELF_OUTBOX` service binding; without
 * it nothing is scheduled or sent. At most six deliveries per non-empty
 * outbox, with doubling backoff, counted in storage before each send.
 */
export const MEET_SELF_OUTBOX_BINDING = 'MEET_AI_SELF_OUTBOX';
export const MEET_SELF_OUTBOX_PURPOSE = 'self-outbox' as const;
export const SELF_OUTBOX_MAX_DELIVERIES = 6;
export const SELF_OUTBOX_BATCH = 64;
export const SELF_OUTBOX_URL = 'https://meet.internal/api/meet-ai/self/outbox';

type Fetcher = { fetch(request: Request): Promise<Response> };
export type MeetSelfOutboxEnv = {
  MEET_AI_SELF_OUTBOX?: Fetcher;
  MEET_AI_PER_SPEAKER?: string;
  MEET_AI_PER_SPEAKER_WORKSPACES?: string;
};

function outboxBinding(env: object | null | undefined): Fetcher | null {
  const value =
    env && Object.hasOwn(env, MEET_SELF_OUTBOX_BINDING)
      ? Reflect.get(env, MEET_SELF_OUTBOX_BINDING)
      : undefined;
  return value && typeof (value as Fetcher).fetch === 'function'
    ? (value as Fetcher)
    : null;
}

/** When the next delivery is due, or undefined when none will run. */
export function selfOutboxDeadline(
  state: { selfCapture?: SelfCaptureState },
  env: object | null | undefined
) {
  const capture = state.selfCapture;
  if (!outboxBinding(env) || !capture?.outbox.length) return undefined;
  const delivery = capture.delivery;
  if ((delivery?.attempts ?? 0) >= SELF_OUTBOX_MAX_DELIVERIES) return undefined;
  return delivery?.nextAt ?? 0;
}

/** The earlier of the empty-room deadline and the next outbox delivery. */
export function earliestDeadline(...deadlines: Array<number | undefined>) {
  const set = deadlines.filter((d): d is number => d !== undefined);
  return set.length ? Math.min(...set) : undefined;
}

function backoff(attempts: number) {
  return SELF_OUTBOX_FIRST_DELIVERY_MS * 2 ** attempts;
}

/**
 * One delivery if due. The attempt is committed before the send; the
 * acknowledged entries are removed from the state current after the send,
 * because other requests may change the room while it is in flight.
 */
export async function runSelfOutboxDelivery<T extends MeetRoomSnapshot>(input: {
  env: object | null | undefined;
  secret: string | undefined;
  roomName: string | undefined;
  now: number;
  read: () => T;
  commit: (state: T) => Promise<void>;
}) {
  const binding = outboxBinding(input.env);
  const before = input.read();
  const capture = before.selfCapture;
  const due = selfOutboxDeadline(before, input.env);
  if (!binding || !capture || due === undefined || due > input.now) return;
  if (!input.secret || !input.roomName) return;
  const attempts = (capture.delivery?.attempts ?? 0) + 1;
  await input.commit({
    ...before,
    selfCapture: {
      ...capture,
      delivery: { attempts, nextAt: input.now + backoff(attempts) },
    },
  });
  const entries = capture.outbox.slice(0, SELF_OUTBOX_BATCH);
  let acked: Array<{ sessionId: string; accountId: string; seq: number }> = [];
  try {
    const response = await binding.fetch(
      new Request(SELF_OUTBOX_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${signMeetServiceCredential(
            {
              aud: 'meet-service',
              purpose: MEET_SELF_OUTBOX_PURPOSE,
              roomId: input.roomName,
              exp: Math.floor(input.now / 1000) + MEET_SERVICE_TTL_SECONDS,
            },
            input.secret
          )}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roomId: input.roomName,
          meetingId: capture.session?.meetingId ?? null,
          entries,
        }),
      })
    );
    if (!response.ok) {
      console.warn(`[meet-self-outbox] delivery refused (${response.status})`);
      return;
    }
    const body = (await response.json().catch(() => null)) as {
      acked?: unknown;
    } | null;
    acked = Array.isArray(body?.acked)
      ? body.acked.filter(
          (e): e is { sessionId: string; accountId: string; seq: number } =>
            !!e &&
            typeof e === 'object' &&
            typeof (e as { sessionId?: unknown }).sessionId === 'string' &&
            typeof (e as { accountId?: unknown }).accountId === 'string' &&
            Number.isSafeInteger((e as { seq?: unknown }).seq)
        )
      : [];
  } catch {
    console.warn('[meet-self-outbox] delivery failed');
    return;
  }
  const current = input.read();
  if (!current.selfCapture || !acked.length) return;
  const next = ackSelfOutbox(current.selfCapture, acked);
  if (next !== current.selfCapture)
    await input.commit({ ...current, selfCapture: next });
}
