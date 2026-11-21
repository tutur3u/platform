import type { MeetRealtimeTrackKind } from '@tuturuuu/realtime/meet';

/** Encoder hints per publication: speech and text stay crisp, cameras stay smooth. */
export function contentHintFor(kind: MeetRealtimeTrackKind) {
  return kind === 'audio'
    ? 'speech'
    : kind === 'screen_audio'
      ? 'music'
      : kind === 'screen'
        ? 'detail'
        : 'motion';
}

/**
 * Relative send priority. When the uplink is short the browser shares it in
 * this order, so speech is never starved by video and a shared screen keeps
 * precedence over cameras.
 */
export function senderPriority(kind: MeetRealtimeTrackKind): RTCPriorityType {
  return kind === 'audio'
    ? 'high'
    : kind === 'screen' || kind === 'screen_audio'
      ? 'medium'
      : 'low';
}

/** Screens keep text legible by giving up frame rate before resolution. */
export async function applyDegradationPreference(
  sender: RTCRtpSender,
  kind: MeetRealtimeTrackKind
) {
  if (kind !== 'screen') return;
  try {
    const parameters = sender.getParameters() as RTCRtpSendParameters & {
      degradationPreference?: string;
    };
    parameters.degradationPreference = 'maintain-resolution';
    await sender.setParameters(parameters);
  } catch {
    // Browsers without the control keep their default trade-off.
  }
}

export type CpuPressure = {
  limited: boolean;
  healthy: number;
  required: number;
  recoveredAt: number;
};

const CPU_BASE_HEALTHY = 10;
const CPU_MAX_HEALTHY = 80;
/** Re-entering CPU limitation this soon after recovering backs off further. */
const CPU_RELAPSE_MS = 60_000;
const CPU_FORGIVE_MS = 600_000;

export function initialCpuPressure(): CpuPressure {
  return {
    limited: false,
    healthy: 0,
    required: CPU_BASE_HEALTHY,
    recoveredAt: -Infinity,
  };
}

/**
 * Hysteresis for `qualityLimitationReason === 'cpu'`: one CPU-limited sample
 * sheds load at once; recovery needs a run of clean samples that doubles each
 * time the encoder relapses shortly after recovering.
 */
export function nextCpuPressure(
  pressure: CpuPressure,
  cpuLimited: boolean | null,
  now: number
): CpuPressure {
  if (cpuLimited) {
    if (pressure.limited) return { ...pressure, healthy: 0 };
    const relapse = now - pressure.recoveredAt < CPU_RELAPSE_MS;
    return {
      ...pressure,
      limited: true,
      healthy: 0,
      required: relapse
        ? Math.min(CPU_MAX_HEALTHY, pressure.required * 2)
        : pressure.required,
    };
  }
  if (!pressure.limited)
    // Ten quiet minutes forgive earlier relapses.
    return pressure.required > CPU_BASE_HEALTHY &&
      now - pressure.recoveredAt > CPU_FORGIVE_MS
      ? { ...pressure, required: CPU_BASE_HEALTHY }
      : pressure;
  if (cpuLimited === null) return pressure;
  const healthy = pressure.healthy + 1;
  return healthy < pressure.required
    ? { ...pressure, healthy }
    : { ...pressure, limited: false, healthy: 0, recoveredAt: now };
}
