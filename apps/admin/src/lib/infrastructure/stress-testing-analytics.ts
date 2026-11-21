import type {
  InfrastructureStressTestResourceSpike,
  InfrastructureStressTestSample,
  InfrastructureStressTestStatus,
  InfrastructureStressTestSummary,
} from '@tuturuuu/internal-api/infrastructure/monitoring';

export function getDefaultStressTestSummary(): InfrastructureStressTestSummary {
  return {
    averageRequestsPerSecond: null,
    capacityJudgement: null,
    errorRate: null,
    estimatedSteadyUsers: null,
    failureMode: null,
    latency: { p50Ms: null, p95Ms: null, p99Ms: null },
    peakRequestsPerSecond: null,
    safeRequestsPerSecond: null,
    saturationPoint: null,
    totalRequests: 0,
  };
}

export function computeStressTestResourceSpikes(
  samples: InfrastructureStressTestSample[],
  startedAt: number | null,
  endedAt: number | null
): InfrastructureStressTestResourceSpike[] {
  const metrics = [
    [
      'cpu',
      'percent',
      (sample: InfrastructureStressTestSample) => sample.cpuPercent,
    ],
    [
      'memory',
      'bytes',
      (sample: InfrastructureStressTestSample) => sample.memoryBytes,
    ],
    ['rx', 'bytes', (sample: InfrastructureStressTestSample) => sample.rxBytes],
    ['tx', 'bytes', (sample: InfrastructureStressTestSample) => sample.txBytes],
  ] as const;

  return metrics.map(([metric, unit, getter]) => {
    const values = samples
      .map((sample) => ({ at: sample.sampledAt, value: getter(sample) }))
      .filter(
        (sample): sample is { at: number; value: number } =>
          sample.value != null && Number.isFinite(sample.value)
      );
    const baseline = values.at(0)?.value ?? null;
    const peakSample = values.reduce(
      (peak, sample) => (sample.value > peak.value ? sample : peak),
      { at: startedAt ?? 0, value: baseline ?? 0 }
    );
    const recovery = values.findLast(
      (sample) =>
        endedAt != null &&
        sample.at >= endedAt &&
        baseline != null &&
        sample.value <= baseline * 1.1
    );

    return {
      baseline,
      delta: baseline == null ? null : peakSample.value - baseline,
      metric,
      peak: values.length > 0 ? peakSample.value : null,
      recoveryMs:
        recovery && endedAt != null ? Math.max(0, recovery.at - endedAt) : null,
      timeToPeakMs:
        startedAt != null ? Math.max(0, peakSample.at - startedAt) : null,
      unit,
    };
  });
}

export function summarizeStressTestSamples(
  samples: InfrastructureStressTestSample[],
  status: InfrastructureStressTestStatus
): InfrastructureStressTestSummary {
  if (samples.length === 0) return getDefaultStressTestSummary();
  const totalRequests = samples.reduce(
    (total, sample) => total + sample.requestsPerSecond,
    0
  );
  const peakRequestsPerSecond = Math.max(
    ...samples.map((sample) => sample.requestsPerSecond)
  );
  const errorRate =
    samples.reduce((total, sample) => total + (sample.errorRate ?? 0), 0) /
    samples.length;
  const latest = samples.at(-1);
  const failureMode =
    status === 'failed'
      ? 'Runner failed before completing the requested profile.'
      : errorRate > 0.05
        ? 'Error rate exceeded 5% during the run.'
        : null;

  return {
    averageRequestsPerSecond: totalRequests / samples.length,
    capacityJudgement:
      status === 'completed' && errorRate <= 0.01
        ? 'Stable under the tested load profile.'
        : status === 'completed'
          ? 'Completed with elevated errors; review saturation signals.'
          : null,
    errorRate,
    estimatedSteadyUsers: latest?.virtualUsers ?? null,
    failureMode,
    latency: {
      p50Ms: latest?.latencyP50Ms ?? null,
      p95Ms: latest?.latencyP95Ms ?? null,
      p99Ms: latest?.latencyP99Ms ?? null,
    },
    peakRequestsPerSecond,
    safeRequestsPerSecond:
      errorRate <= 0.01 ? Math.floor(peakRequestsPerSecond * 0.8) : null,
    saturationPoint: failureMode,
    totalRequests: Math.round(totalRequests),
  };
}
