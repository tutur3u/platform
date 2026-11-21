import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  classifyCrossAppHandoff,
  getConfirmedReturnKey,
  withHandoffTimeout,
} from './cross-app-handoff-outcome';

const tokenized =
  'https://showcase.ieeai.net/edufest/verify-token?state=s&token=t&originApp=web&targetApp=edufest';

describe('classifyCrossAppHandoff', () => {
  it('redirects only with both a tokenized returnUrl and a target app', () => {
    expect(
      classifyCrossAppHandoff(
        { returnUrl: tokenized, targetApp: 'edufest' },
        { stepUpAttempted: false }
      )
    ).toEqual({ kind: 'redirect', returnUrl: tokenized });
    expect(
      classifyCrossAppHandoff(
        { returnUrl: tokenized },
        { stepUpAttempted: false }
      )
    ).toEqual({ failure: 'handoff', kind: 'failure' });
  });

  it('opens MFA step-up once for a required-MFA refusal', () => {
    expect(
      classifyCrossAppHandoff(
        { code: 'MFA_REQUIRED' },
        { stepUpAttempted: false }
      )
    ).toEqual({ kind: 'mfa_step_up' });
    expect(
      classifyCrossAppHandoff(
        { code: 'MFA_REQUIRED' },
        { stepUpAttempted: true }
      )
    ).toEqual({ failure: 'handoff', kind: 'failure' });
  });

  it.each([
    [{ code: 'AUTH_UNAVAILABLE' }, 'handoff'],
    [{ error: 'Failed to generate token' }, 'handoff'],
    [
      { code: 'PKCE_REQUIRED', error: 'An S256 code challenge is required' },
      'handoff',
    ],
    [null, 'handoff'],
    [{ error: 'Invalid returnUrl' }, 'invalid'],
  ] as const)('maps %j to a %s failure', (handoff, failure) => {
    expect(
      classifyCrossAppHandoff(handoff, { stepUpAttempted: false })
    ).toEqual({ failure, kind: 'failure' });
  });
});

describe('getConfirmedReturnKey', () => {
  it('binds a confirmation to both the account and the exact returnUrl', () => {
    const key = getConfirmedReturnKey('user-1', 'https://a.example/cb');

    expect(key).not.toBeNull();
    expect(getConfirmedReturnKey('user-2', 'https://a.example/cb')).not.toBe(
      key
    );
    expect(
      getConfirmedReturnKey('user-1', 'https://a.example/cb?x=1')
    ).not.toBe(key);
    expect(getConfirmedReturnKey(undefined, 'https://a.example/cb')).toBeNull();
    expect(getConfirmedReturnKey('user-1', null)).toBeNull();
  });
});

describe('withHandoffTimeout', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects a handoff step that never settles', async () => {
    vi.useFakeTimers();
    const stalled = withHandoffTimeout(new Promise<never>(() => {}), 1000);
    const assertion = expect(stalled).rejects.toThrow('timed out');

    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it('passes through a step that settles in time', async () => {
    await expect(withHandoffTimeout(Promise.resolve('ok'), 1000)).resolves.toBe(
      'ok'
    );
  });
});
