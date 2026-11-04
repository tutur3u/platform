import { describe, expect, it, vi } from 'vitest';

// Simulates a registry that still names a released domain, so the lookup
// guard itself is what rejects it.
vi.mock('./internal-domains-env', () => ({
  resolveConfiguredInternalAppDomains: () => [
    { kind: 'internal', name: 'rewise', url: 'https://rewise.me' },
    { kind: 'internal', name: 'rewise', url: 'https://app.rewise.school' },
  ],
}));

const { getAppDomainByUrl, getAppDomainMap } = await import(
  './internal-domains'
);

describe('released domain lookup guard', () => {
  it('rejects released domains even when a registry still lists them', () => {
    expect(
      getAppDomainMap().some((domain) => domain.url === 'https://rewise.me')
    ).toBe(true);
    expect(getAppDomainByUrl('https://rewise.me/verify-token')).toBeNull();
    expect(getAppDomainByUrl('https://app.rewise.school')).toBeNull();
    expect(getAppDomainByUrl('https://rewise.tuturuuu.com')?.name).toBe(
      'rewise'
    );
  });
});
