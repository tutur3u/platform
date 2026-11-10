import { describe, expect, it } from 'vitest';
import {
  outcomeFromDatabaseError,
  parseAuditRows,
  parseMutationPayload,
  parseOverrideRows,
} from './runtime-codec';

describe('feature flag store codec', () => {
  it('maps raised database rejections and ignores unrelated failures', () => {
    expect(
      outcomeFromDatabaseError({
        message: 'platform_feature_flag_read_only_workspace_secret',
      })
    ).toMatchObject({ code: 'read_only_workspace_secret', storage: false });
    expect(
      outcomeFromDatabaseError({ message: 'connection reset' })
    ).toBeNull();
  });

  it('parses an applied payload and rejects a partial one', () => {
    expect(
      parseMutationPayload({
        environment: 'production',
        flagKey: 'mobile_offline',
        matchesRequest: true,
        newOverride: true,
        newRevision: 1,
        oldOverride: null,
        oldRevision: 0,
        operationId: '22222222-2222-4222-8222-222222222222',
        replayed: false,
        revision: 1,
        status: 'applied',
      })?.status
    ).toBe('applied');
    expect(parseMutationPayload({ status: 'applied' })).toBeNull();
    expect(
      parseOverrideRows({
        overrides: [
          { flagKey: 'mobile_offline', overrideEnabled: null, revision: 2 },
        ],
      })
    ).toEqual([
      { flagKey: 'mobile_offline', overrideEnabled: null, revision: 2 },
    ]);
    expect(parseAuditRows({ rows: [] })).toEqual([]);
    expect(parseAuditRows({ rows: [{ operationId: 'x' }] })).toBeNull();
  });
});
