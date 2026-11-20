import { describe, expect, it } from 'vitest';
import { liveBillingWsId, toLiveEntryState } from './use-live-eligibility';

describe('toLiveEntryState', () => {
  it('stays checking until the pre-check settles', () => {
    expect(toLiveEntryState({ data: undefined, isError: false })).toEqual({
      status: 'checking',
    });
  });

  it('does not block when the pre-check itself fails', () => {
    expect(toLiveEntryState({ data: undefined, isError: true })).toEqual({
      status: 'unknown',
    });
  });

  it('blocks with the server reason', () => {
    const state = toLiveEntryState({
      data: {
        eligible: false,
        reason: 'paused',
        tier: 'PRO',
        billing: null,
        params: { plans: [] },
      },
      isError: false,
    });
    expect(state).toMatchObject({
      status: 'blocked',
      eligibility: { reason: 'paused' },
    });
  });
});

describe('liveBillingWsId', () => {
  it('uses the selected credit workspace, else the access or personal one', () => {
    expect(
      liveBillingWsId({ creditSource: 'personal', creditWsId: 'p1', wsId: 'w' })
    ).toBe('p1');
    expect(liveBillingWsId({ creditSource: 'workspace', wsId: 'w' })).toBe('w');
    expect(liveBillingWsId({ creditSource: 'personal', wsId: 'w' })).toBe(
      'personal'
    );
  });
});
