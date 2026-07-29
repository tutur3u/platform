import { describe, expect, it } from 'vitest';
import {
  aggregateUsageRows,
  resolveObservabilityRange,
} from './observability-helpers';

describe('AI Studio observability helpers', () => {
  it('uses the UTC month boundary for the default range', () => {
    expect(
      resolveObservabilityRange(
        'month',
        '',
        '',
        new Date('2026-07-29T08:30:00.000Z')
      )
    ).toEqual({
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-29T08:30:00.000Z',
    });
  });

  it('rejects invalid or overlong custom ranges', () => {
    expect(resolveObservabilityRange('custom', '', '')).toBeNull();
    expect(
      resolveObservabilityRange('custom', '2025-01-01', '2026-07-29')
    ).toBeNull();
  });

  it('aggregates credits, cost, requests, and every billable unit', () => {
    const rows = [
      {
        abortedCount: 0,
        averageLatencyMs: 0,
        billedCredits: 2,
        bucketDate: '2026-07-29',
        embeddingUnits: 3,
        failedCount: 0,
        feature: 'chat',
        imageUnits: 4,
        inputTokens: 5,
        latencySampleCount: 0,
        modelId: 'model-a',
        outputTokens: 6,
        providerCostUsd: 0.25,
        reasoningTokens: 7,
        requestCount: 1,
        searchUnits: 8,
        sourceId: 'user-1',
        sourceType: 'workspace_credit' as const,
        succeededCount: 1,
      },
    ];

    expect(aggregateUsageRows(rows, (row) => row.feature)).toEqual([
      {
        cost: 0.25,
        credits: 2,
        label: 'chat',
        requests: 1,
        units: 33,
      },
    ]);
  });
});
