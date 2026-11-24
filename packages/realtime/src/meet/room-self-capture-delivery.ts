import type { MeetRoomSnapshot } from './room';
import {
  deliveryDue,
  restartDelivery,
  scheduleNextDelivery,
  SELF_OUTBOX_FAST_DELIVERIES,
} from './room-self-capture-cycle';
import {
  ackSelfOutbox,
  type SelfCaptureState,
  type SelfOutboxEntry,
} from './room-self-capture-state';
import {
  MEET_SERVICE_TTL_SECONDS,
  signMeetServiceCredential,
} from './service-credential';

/**
 * Alarm delivery of the per-speaker legal outbox to the Meet Worker, for
 * endings no request will drain (room end, leave, removal). It runs only when
 * the realtime Worker has the `MEET_AI_SELF_OUTBOX` service binding; without
 * it nothing is scheduled or sent. Each attempt is counted in storage before
 * the send; the cycle bounds are in room-self-capture-cycle. The Meet Worker
 * acknowledges every entry it applied or found already applied or terminal
 * (stale room sequence, account or session gone); anything else is retried.
 */
export const MEET_SELF_OUTBOX_BINDING = 'MEET_AI_SELF_OUTBOX';
export const MEET_SELF_OUTBOX_PURPOSE = 'self-outbox' as const;
export const SELF_OUTBOX_MAX_DELIVERIES = SELF_OUTBOX_FAST_DELIVERIES;
export const SELF_OUTBOX_BATCH = 64;
/** Per-account share of one delivery, so one account never fills it. */
export const SELF_OUTBOX_ACCOUNT_BATCH = 8;
/** Hard cap on deliveries per room per UTC day, whatever the cycles say. */
export const SELF_OUTBOX_DAILY_DELIVERIES = 500;
const DAY_MS = 86_400_000;
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
  // A stored outbox without a cycle (older state) starts one now.
  const due = deliveryDue(capture.delivery ?? restartDelivery(undefined, 0));
  const day = capture.deliveryDay;
  // A spent daily cap waits for the next UTC day.
  return due !== undefined && day && day.count >= SELF_OUTBOX_DAILY_DELIVERIES
    ? Math.max(due, (day.day + 1) * DAY_MS)
    : due;
}

/** The earlier of the empty-room deadline and the next outbox delivery. */
export function earliestDeadline(...deadlines: Array<number | undefined>) {
  const set = deadlines.filter((d): d is number => d !== undefined);
  return set.length ? Math.min(...set) : undefined;
}

/**
 * Up to eight entries per account in queue order, accounts that failed least
 * first, so an account whose entries keep failing never blocks the others.
 */
export function selectSelfOutboxBatch(capture: SelfCaptureState) {
  const byAccount = new Map<string, SelfOutboxEntry[]>();
  for (const entry of capture.outbox) {
    const list = byAccount.get(entry.accountId) ?? [];
    if (list.length < SELF_OUTBOX_ACCOUNT_BATCH) list.push(entry);
    byAccount.set(entry.accountId, list);
  }
  const failures = capture.delivery?.failures ?? {};
  return [...byAccount.entries()]
    .sort(([a], [b]) => (failures[a] ?? 0) - (failures[b] ?? 0))
    .flatMap(([, list]) => list)
    .slice(0, SELF_OUTBOX_BATCH);
}

type Acked = { sessionId: string; accountId: string; seq: number };

function readAcked(body: { acked?: unknown } | null): Acked[] {
  return Array.isArray(body?.acked)
    ? body.acked.filter(
        (e): e is Acked =>
          !!e &&
          typeof e === 'object' &&
          typeof (e as { sessionId?: unknown }).sessionId === 'string' &&
          typeof (e as { accountId?: unknown }).accountId === 'string' &&
          Number.isSafeInteger((e as { seq?: unknown }).seq)
      )
    : [];
}

/** Counts a failed delivery for each account whose oldest entry stayed. */
function recordFailures(
  capture: SelfCaptureState,
  sent: SelfOutboxEntry[],
  acked: Acked[]
): SelfCaptureState {
  if (!capture.delivery) return capture;
  const done = new Set(
    acked.map((e) => `${e.sessionId}:${e.accountId}:${e.seq}`)
  );
  const heads = new Map<string, SelfOutboxEntry>();
  for (const entry of sent)
    if (!heads.has(entry.accountId)) heads.set(entry.accountId, entry);
  const failures = { ...capture.delivery.failures };
  let changed = false;
  for (const [accountId, head] of heads) {
    if (done.has(`${head.sessionId}:${head.accountId}:${head.seq}`)) continue;
    if (!capture.outbox.some((e) => e.accountId === accountId)) continue;
    failures[accountId] = (failures[accountId] ?? 0) + 1;
    changed = true;
    if (failures[accountId] === SELF_OUTBOX_FAST_DELIVERIES)
      console.warn('[meet-self-outbox] an account entry keeps failing');
  }
  return changed
    ? { ...capture, delivery: { ...capture.delivery, failures } }
    : capture;
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
  const day = Math.floor(input.now / DAY_MS);
  const sent =
    capture.deliveryDay?.day === day ? capture.deliveryDay.count : 0;
  if (sent >= SELF_OUTBOX_DAILY_DELIVERIES) return;
  const delivery = capture.delivery ?? restartDelivery(undefined, input.now);
  await input.commit({
    ...before,
    selfCapture: {
      ...capture,
      delivery: scheduleNextDelivery(delivery, input.now),
      deliveryDay: { day, count: sent + 1 },
    },
  });
  const entries = selectSelfOutboxBatch(capture);
  let acked: Acked[] = [];
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
    if (response.ok)
      acked = readAcked(
        (await response.json().catch(() => null)) as { acked?: unknown } | null
      );
    else
      console.warn(`[meet-self-outbox] delivery refused (${response.status})`);
  } catch {
    console.warn('[meet-self-outbox] delivery failed');
  }
  const current = input.read();
  if (!current.selfCapture) return;
  const next = ackSelfOutbox(
    recordFailures(current.selfCapture, entries, acked),
    acked,
    input.now
  );
  if (next !== current.selfCapture)
    await input.commit({ ...current, selfCapture: next });
  if (next.outbox.length && deliveryDue(next.delivery) === undefined)
    console.error(
      '[meet-self-outbox] retry window ended with legal entries undelivered'
    );
}
