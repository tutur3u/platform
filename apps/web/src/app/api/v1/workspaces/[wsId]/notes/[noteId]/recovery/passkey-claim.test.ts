import { describe, expect, it } from 'vitest';
import { hasRecentPasskeyClaim } from './passkey-claim';

describe('note recovery passkey gate', () => {
  const now = 1800000000;
  it('requires a recent passkey on the same account', () => {
    const claim = {
      sub: 'owner',
      amr: [{ method: 'passkey', timestamp: now - 60 }],
    };
    expect(hasRecentPasskeyClaim(claim, 'owner', now)).toBe(true);
    expect(hasRecentPasskeyClaim(claim, 'another-user', now)).toBe(false);
    expect(
      hasRecentPasskeyClaim(
        { ...claim, amr: [{ method: 'password', timestamp: now }] },
        'owner',
        now
      )
    ).toBe(false);
    expect(
      hasRecentPasskeyClaim(
        { ...claim, amr: [{ method: 'passkey', timestamp: now - 301 }] },
        'owner',
        now
      )
    ).toBe(false);
    expect(
      hasRecentPasskeyClaim(
        { ...claim, amr: [{ method: 'passkey', timestamp: now + 10 }] },
        'owner',
        now
      )
    ).toBe(false);
  });
});
