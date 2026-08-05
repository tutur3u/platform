import type { AiStudioUsageRow } from '@tuturuuu/internal-api/ai-studio';

export type ObservabilityPreset = 'month' | '7' | '30' | '90' | 'custom';

export function aggregateUsageRows(
  rows: AiStudioUsageRow[],
  label: (row: AiStudioUsageRow) => string
) {
  const values = new Map<
    string,
    {
      cost: number;
      credits: number;
      requests: number;
      unmetered: number;
      units: number;
    }
  >();
  for (const row of rows) {
    const key = label(row);
    const current = values.get(key) ?? {
      cost: 0,
      credits: 0,
      requests: 0,
      unmetered: 0,
      units: 0,
    };
    current.cost += row.providerCostUsd;
    current.credits += row.billedCredits;
    current.requests += row.requestCount;
    current.unmetered += row.unmeteredCredits;
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
    .sort(
      (a, b) =>
        // Unmetered rows bill zero credits, so ordering on credits alone would
        // sink an external app to the bottom no matter how much it consumed.
        b.credits + b.unmetered - (a.credits + a.unmetered) || b.cost - a.cost
    );
}

/**
 * Collapses the model/feature/source breakdown into one point per day for the
 * usage charts. Days with no traffic are absent rather than zero-filled, which
 * keeps sparse workspaces readable.
 */
export function buildUsageSeries(rows: AiStudioUsageRow[]) {
  const byDate = new Map<
    string,
    { cost: number; credits: number; date: string; requests: number }
  >();

  for (const row of rows) {
    const entry = byDate.get(row.bucketDate) ?? {
      cost: 0,
      credits: 0,
      date: row.bucketDate,
      requests: 0,
    };
    entry.cost += row.providerCostUsd;
    entry.credits += row.billedCredits;
    entry.requests += row.requestCount;
    byDate.set(row.bucketDate, entry);
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
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
