import { describe, expect, it } from 'vitest';
import { normalizePeriodicReportCounts } from './report-counts';

describe('normalizePeriodicReportCounts', () => {
  it('preserves exact aggregates above the PostgREST row limit', () => {
    expect(
      normalizePeriodicReportCounts({
        approved: 12_345,
        blocked: 9,
        delivered: 10_001,
        draft: 2_344,
        failed: 11,
        pending_review: 2_335,
        total: 12_345,
      })
    ).toEqual({
      approved: 12_345,
      blocked: 9,
      delivered: 10_001,
      draft: 2_344,
      failed: 11,
      pendingReview: 2_335,
      total: 12_345,
    });
  });

  it('normalizes an empty RPC response to zeroes', () => {
    expect(normalizePeriodicReportCounts()).toEqual({
      approved: 0,
      blocked: 0,
      delivered: 0,
      draft: 0,
      failed: 0,
      pendingReview: 0,
      total: 0,
    });
  });
});
