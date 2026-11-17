import { meetRequest } from './request-context';

/** Closed label set; nothing else can reach the response header. */
export const SERVER_TIMING_LABELS = [
  'actor',
  'invitation',
  'context',
  'profile',
  'hosting',
  'total',
] as const;
export type ServerTimingLabel = (typeof SERVER_TIMING_LABELS)[number];

const MAX_DURATION_MS = 1_000_000;

// Keyed by the response header bag, which the proxy bridge shares between the
// outer and the rewritten request context of one request.
const phasesByRequest = new WeakMap<Headers, Map<ServerTimingLabel, number>>();

function requestPhases() {
  try {
    const key = meetRequest().responseHeaders;
    let phases = phasesByRequest.get(key);
    if (!phases) {
      phases = new Map();
      phasesByRequest.set(key, phases);
    }
    return phases;
  } catch {
    return undefined;
  }
}

function roundedDuration(durationMs: number) {
  return Number.isFinite(durationMs) &&
    durationMs >= 0 &&
    durationMs <= MAX_DURATION_MS
    ? Math.round(durationMs * 10) / 10
    : undefined;
}

export function recordMeetPhase(label: ServerTimingLabel, durationMs: number) {
  const duration = roundedDuration(durationMs);
  if (duration !== undefined) requestPhases()?.set(label, duration);
}

/** Resolves like `work`; records the time until it settles. */
export async function timeMeetPhase<T>(
  label: ServerTimingLabel,
  work: Promise<T>
): Promise<T> {
  const startedAt = performance.now();
  try {
    return await work;
  } finally {
    recordMeetPhase(label, performance.now() - startedAt);
  }
}

/**
 * Appends Server-Timing to a signed-in HTML 200 only: the actor phase is
 * recorded when a session actor exists, and redirects, errors and non-HTML
 * responses never carry the header. Durations only; no Timing-Allow-Origin.
 */
export function withMeetServerTiming(response: Response, totalMs: number) {
  const phases = requestPhases();
  if (
    !phases?.has('actor') ||
    response.status !== 200 ||
    !response.headers.get('content-type')?.toLowerCase().startsWith('text/html')
  )
    return response;
  const entries = SERVER_TIMING_LABELS.flatMap((label) => {
    const duration = roundedDuration(
      label === 'total' ? totalMs : (phases.get(label) ?? Number.NaN)
    );
    return duration === undefined ? [] : [`${label};dur=${duration}`];
  });
  if (!entries.length) return response;
  const next = new Response(response.body, response);
  next.headers.append('Server-Timing', entries.join(', '));
  return next;
}
