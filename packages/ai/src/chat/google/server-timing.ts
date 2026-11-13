export const SERVER_TIMING_STAGES = [
  'auth',
  'scope',
  'credits',
  'history',
  'context',
  'model-start',
] as const;

export type ServerTimingStage = (typeof SERVER_TIMING_STAGES)[number];

export type ServerTimingDurations = Record<ServerTimingStage, number>;

export function emptyServerTiming(): ServerTimingDurations {
  return {
    auth: 0,
    scope: 0,
    credits: 0,
    history: 0,
    context: 0,
    'model-start': 0,
  };
}

function formatDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs < 0) return '0.0';
  return durationMs.toFixed(1);
}

/** Stage names and durations only. Callers must not put identifiers in here. */
export function formatServerTiming(durations: ServerTimingDurations): string {
  return SERVER_TIMING_STAGES.map(
    (stage) => `${stage};dur=${formatDuration(durations[stage])}`
  ).join(', ');
}

export function withServerTiming(
  response: Response,
  durations: ServerTimingDurations
): Response {
  const headers = new Headers(response.headers);
  headers.set('Server-Timing', formatServerTiming(durations));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
