import { describe, expect, it } from 'vitest';
import {
  getAllowedPrivacyPurposes,
  PRIVACY_CONSENT_MAX_AGE_MS,
  PRIVACY_CONSENT_STORAGE_KEY,
  PRIVACY_CONSENT_VERSION,
  PRIVACY_POLICY_VERSION,
  PRIVACY_PROVIDERS,
  type PrivacyConsentStorage,
  readPrivacyConsent,
  savePrivacyConsent,
} from './privacy-consent';

const now = Date.UTC(2026, 10, 8);

function memoryStorage(initial?: string): PrivacyConsentStorage {
  const values = new Map<string, string>();
  if (initial) values.set(PRIVACY_CONSENT_STORAGE_KEY, initial);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

function acceptedRecord() {
  return {
    version: PRIVACY_CONSENT_VERSION,
    policyVersion: PRIVACY_POLICY_VERSION,
    updatedAt: now,
    strictlyNecessary: true,
    analytics: true,
    marketing: true,
  };
}

describe('privacy consent', () => {
  it('fails closed for missing and inaccessible storage', () => {
    expect(readPrivacyConsent({ storage: null, now })).toBeNull();
    expect(readPrivacyConsent({ storage: memoryStorage(), now })).toBeNull();
    const blocked = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('blocked');
      },
      removeItem() {
        throw new Error('blocked');
      },
    };
    expect(readPrivacyConsent({ storage: blocked, now })).toBeNull();
    expect(
      savePrivacyConsent({
        storage: blocked,
        analytics: true,
        marketing: true,
        now,
      })
    ).toEqual({ ok: false, choice: null });
  });

  it.each([
    'not json',
    'null',
    '[]',
    '{}',
    JSON.stringify({ ...acceptedRecord(), version: 0 }),
    JSON.stringify({ ...acceptedRecord(), policyVersion: 'old' }),
    JSON.stringify({ ...acceptedRecord(), updatedAt: now + 1 }),
    JSON.stringify({
      ...acceptedRecord(),
      updatedAt: now - PRIVACY_CONSENT_MAX_AGE_MS,
    }),
    JSON.stringify({ ...acceptedRecord(), updatedAt: -1 }),
    JSON.stringify({ ...acceptedRecord(), strictlyNecessary: false }),
    JSON.stringify({ ...acceptedRecord(), analytics: 'true' }),
    JSON.stringify({ ...acceptedRecord(), marketing: null }),
    JSON.stringify({ ...acceptedRecord(), visitorId: 'unexpected' }),
  ])('rejects invalid or expired evidence %s', (raw) => {
    expect(readPrivacyConsent({ storage: memoryStorage(raw), now })).toBeNull();
  });

  it('persists rejection with essential services always enabled', () => {
    const storage = memoryStorage();
    const saved = savePrivacyConsent({
      storage,
      analytics: false,
      marketing: false,
      now,
    });
    expect(saved.ok).toBe(true);
    expect(readPrivacyConsent({ storage, now })).toEqual({
      ...acceptedRecord(),
      analytics: false,
      marketing: false,
    });
    expect(
      getAllowedPrivacyPurposes({
        choice: readPrivacyConsent({ storage, now }),
        now,
      })
    ).toEqual({ strictlyNecessary: true, analytics: false, marketing: false });
  });

  it('keeps accepted purpose choices separate from empty provider activation', () => {
    const storage = memoryStorage();
    savePrivacyConsent({ storage, analytics: true, marketing: true, now });
    const choice = readPrivacyConsent({ storage, now });
    expect(choice?.analytics).toBe(true);
    expect(PRIVACY_PROVIDERS).toEqual([]);
    expect(getAllowedPrivacyPurposes({ choice, now })).toEqual({
      strictlyNecessary: true,
      analytics: false,
      marketing: false,
    });
    expect(
      getAllowedPrivacyPurposes({
        choice,
        providers: [{ id: 'future', enabled: true, purpose: 'analytics' }],
        now,
      })
    ).toEqual({ strictlyNecessary: true, analytics: true, marketing: false });
  });

  it('requires both a current positive choice and explicit provider enablement', () => {
    const storage = memoryStorage();
    savePrivacyConsent({ storage, analytics: true, marketing: false, now });
    const choice = readPrivacyConsent({ storage, now });
    expect(
      getAllowedPrivacyPurposes({
        choice,
        providers: [{ id: 'future', enabled: false, purpose: 'analytics' }],
        now,
      }).analytics
    ).toBe(false);
    expect(
      getAllowedPrivacyPurposes({
        choice: null,
        providers: [{ id: 'future', enabled: true, purpose: 'analytics' }],
        now,
      }).analytics
    ).toBe(false);
    expect(
      getAllowedPrivacyPurposes({
        choice,
        providers: [{ id: 'future', enabled: true, purpose: 'analytics' }],
        now: now + PRIVACY_CONSENT_MAX_AGE_MS,
      }).analytics
    ).toBe(false);
  });

  it('withdraws an earlier acceptance durably across a reload', () => {
    const storage = memoryStorage();
    savePrivacyConsent({ storage, analytics: true, marketing: true, now });
    savePrivacyConsent({
      storage,
      analytics: false,
      marketing: false,
      now: now + 1,
    });
    const reloaded = readPrivacyConsent({ storage, now: now + 1 });
    expect(
      getAllowedPrivacyPurposes({
        choice: reloaded,
        providers: [{ id: 'future', enabled: true, purpose: 'analytics' }],
        now: now + 1,
      }).analytics
    ).toBe(false);
    expect(reloaded?.marketing).toBe(false);
  });

  it('clears stale acceptance after a failed or silently ignored save', () => {
    for (const throws of [true, false]) {
      const underlying = memoryStorage(JSON.stringify(acceptedRecord()));
      const storage = {
        ...underlying,
        setItem() {
          if (throws) throw new Error('quota');
        },
      };
      expect(
        savePrivacyConsent({ storage, analytics: false, marketing: false, now })
      ).toEqual({ ok: false, choice: null });
      expect(readPrivacyConsent({ storage, now })).toBeNull();
    }
  });

  it('does not persist invalid timestamps', () => {
    for (const timestamp of [NaN, Infinity, -1]) {
      expect(
        savePrivacyConsent({
          storage: memoryStorage(),
          analytics: true,
          marketing: true,
          now: timestamp,
        })
      ).toEqual({ ok: false, choice: null });
    }
  });
});
