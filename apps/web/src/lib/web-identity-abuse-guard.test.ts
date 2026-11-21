import { describe, expect, it } from 'vitest';
import { isAbuseGuardWorkerService } from './web-identity-abuse-guard';

describe('isAbuseGuardWorkerService', () => {
  it('admits the API identity and vinext Workers', () => {
    expect(isAbuseGuardWorkerService('web-api-identity')).toBe(true);
    expect(isAbuseGuardWorkerService('web-vinext')).toBe(true);
    expect(isAbuseGuardWorkerService('web-vinext-api-core')).toBe(true);
  });

  it('keeps other runtimes on their configured store', () => {
    expect(isAbuseGuardWorkerService(undefined)).toBe(false);
    expect(isAbuseGuardWorkerService('web')).toBe(false);
    expect(isAbuseGuardWorkerService('web-vinextish')).toBe(false);
  });
});
