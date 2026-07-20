import { describe, expect, it } from 'vitest';
import { shouldSkipAppSessionStepUpChallenge } from './api-auth';

describe('Tasks app-session step-up policy', () => {
  it('trusts signed sessions issued by Web specifically for Tasks', () => {
    expect(
      shouldSkipAppSessionStepUpChallenge({
        origin_app: 'web',
        target_app: 'tasks',
      })
    ).toBe(true);
  });

  it('does not bypass step-up for unrelated browser app sessions', () => {
    expect(
      shouldSkipAppSessionStepUpChallenge({
        origin_app: 'web',
        target_app: 'calendar',
      })
    ).toBe(false);
  });

  it('respects an explicit route-level bypass', () => {
    expect(
      shouldSkipAppSessionStepUpChallenge(
        { origin_app: 'external', target_app: 'tasks' },
        true
      )
    ).toBe(true);
  });
});
