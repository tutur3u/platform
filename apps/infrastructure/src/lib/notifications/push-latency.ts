export const PUSH_LATENCY_CHANNELS = [
  'mail',
  'chat',
  'tasks',
  'time_tracking',
  'meet',
  'finance',
  'workspace',
  'account',
  'other',
] as const;

export type PushLatencyChannel = (typeof PUSH_LATENCY_CHANNELS)[number];

export type PushLatencyRow = {
  channel: string;
  max_ms: number | null;
  p50_ms: number | null;
  p95_ms: number | null;
  sent_count: number | string;
};

export type PushLatencyChannelSummary = {
  channel: PushLatencyChannel;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  sentCount: number;
};

export const PUSH_LATENCY_WINDOW_MS = 24 * 60 * 60 * 1000;

function isChannel(value: string): value is PushLatencyChannel {
  return (PUSH_LATENCY_CHANNELS as readonly string[]).includes(value);
}

/** Orders SQL per-channel aggregates; percentiles are computed in SQL. */
export function summarizePushLatency(
  rows: PushLatencyRow[]
): PushLatencyChannelSummary[] {
  const byChannel = new Map<PushLatencyChannel, PushLatencyChannelSummary>();
  for (const row of rows) {
    const sentCount = Number(row.sent_count);
    if (
      !isChannel(row.channel) ||
      !Number.isFinite(sentCount) ||
      sentCount <= 0
    )
      continue;
    byChannel.set(row.channel, {
      channel: row.channel,
      maxMs: Math.round(row.max_ms ?? 0),
      p50Ms: Math.round(row.p50_ms ?? 0),
      p95Ms: Math.round(row.p95_ms ?? 0),
      sentCount,
    });
  }
  return PUSH_LATENCY_CHANNELS.flatMap((channel) => {
    const summary = byChannel.get(channel);
    return summary ? [summary] : [];
  });
}

export type PushLatencyResult =
  | { status: 'ready'; channels: PushLatencyChannelSummary[] }
  | { status: 'error' };

export async function loadPushLatency(
  sbAdmin: any,
  now = Date.now()
): Promise<PushLatencyResult> {
  const { data, error } = await sbAdmin
    .schema('private')
    .rpc('push_delivery_latency_summary', {
      p_since: new Date(now - PUSH_LATENCY_WINDOW_MS).toISOString(),
    });
  if (error) {
    console.error('[PushLatency] Failed to load push latency', error);
    return { status: 'error' };
  }
  return {
    status: 'ready',
    channels: summarizePushLatency((data ?? []) as PushLatencyRow[]),
  };
}
