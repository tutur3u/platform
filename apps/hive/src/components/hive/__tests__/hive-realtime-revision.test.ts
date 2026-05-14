import { describe, expect, it } from 'vitest';
import { shouldApplyHiveRealtimeRevision } from '../hive-realtime-revision';

describe('shouldApplyHiveRealtimeRevision', () => {
  it('accepts the initial zero snapshot and newer revisions', () => {
    expect(shouldApplyHiveRealtimeRevision(0, 0)).toBe(true);
    expect(shouldApplyHiveRealtimeRevision(8, 7)).toBe(true);
  });

  it('rejects stale, equal, and invalid revisions', () => {
    expect(shouldApplyHiveRealtimeRevision(7, 8)).toBe(false);
    expect(shouldApplyHiveRealtimeRevision(8, 8)).toBe(false);
    expect(shouldApplyHiveRealtimeRevision(Number.NaN, 8)).toBe(false);
  });
});
