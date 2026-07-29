import type { AiStudioUsageRow } from '@tuturuuu/internal-api/ai-studio';

export type ObservabilityPreset = 'month' | '7' | '30' | '90' | 'custom';

export function aggregateUsageRows(
  rows: AiStudioUsageRow[],
  label: (row: AiStudioUsageRow) => string
) {
  const values = new Map<
    string,
    { cost: number; credits: number; requests: number; units: number }
  >();
  for (const row of rows) {
    const key = label(row);
    const current = values.get(key) ?? {
      cost: 0,
      credits: 0,
      requests: 0,
      units: 0,
    };
    current.cost += row.providerCostUsd;
    current.credits += row.billedCredits;
    current.requests += row.requestCount;
    current.units +=
      row.inputTokens +
      row.outputTokens +
      row.reasoningTokens +
      row.embeddingUnits +
      row.imageUnits +
      row.searchUnits;
    values.set(key, current);
  }
  return [...values.entries()]
    .map(([entryLabel, value]) => ({ label: entryLabel, ...value }))
    .sort((a, b) => b.credits - a.credits || b.cost - a.cost);
}

export function resolveObservabilityRange(
  preset: ObservabilityPreset,
  customFrom: string,
  customTo: string,
  now = new Date()
) {
  if (preset === 'custom') {
    if (!customFrom || !customTo) return null;
    const from = new Date(`${customFrom}T00:00:00.000Z`);
    const to = new Date(`${customTo}T23:59:59.999Z`);
    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      to <= from ||
      to.getTime() - from.getTime() > 366 * 86_400_000
    ) {
      return null;
    }
    return { from: from.toISOString(), to: to.toISOString() };
  }
  const from =
    preset === 'month'
      ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      : new Date(now.getTime() - Number(preset) * 86_400_000);
  return { from: from.toISOString(), to: now.toISOString() };
}
