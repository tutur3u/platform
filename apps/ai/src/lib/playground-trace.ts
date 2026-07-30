import type { AiStudioPlaygroundStep } from '@tuturuuu/internal-api/ai-studio';

export function formatTraceDuration(
  durationMs: number | null | undefined
): string {
  if (durationMs == null || !Number.isFinite(durationMs)) return '—';
  if (durationMs < 1) return `${durationMs.toFixed(2)} ms`;
  if (durationMs < 10) return `${durationMs.toFixed(1)} ms`;
  if (durationMs < 1_000) return `${Math.round(durationMs)} ms`;
  if (durationMs < 60_000) {
    return `${(durationMs / 1_000).toFixed(durationMs < 10_000 ? 2 : 1)} s`;
  }
  return `${(durationMs / 60_000).toFixed(1)} min`;
}

export function formatTraceJson(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

export function summarizePlaygroundTrace(steps: AiStudioPlaygroundStep[]) {
  const timestamps = steps.flatMap((step) => {
    const startedAt = step.startedAt ? Date.parse(step.startedAt) : Number.NaN;
    const completedAt = step.completedAt
      ? Date.parse(step.completedAt)
      : Number.NaN;
    return [
      ...(Number.isFinite(startedAt) ? [startedAt] : []),
      ...(Number.isFinite(completedAt) ? [completedAt] : []),
    ];
  });

  return {
    durationMs:
      timestamps.length > 1
        ? Math.max(...timestamps) - Math.min(...timestamps)
        : null,
    modelSteps: steps.filter((step) => step.type === 'model').length,
    toolSteps: steps.filter((step) => step.type === 'tool').length,
  };
}
