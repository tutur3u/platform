import { describe, expect, it } from 'vitest';
import {
  PRIVACY_CONSENT_MAX_AGE_MS,
  PRIVACY_CONSENT_STORAGE_KEY,
  type PrivacyConsentStorage,
  savePrivacyConsent,
} from './privacy-consent';
import {
  loadPrivacyConsentState,
  type PrivacyConsentState,
  transitionPrivacyConsentState,
} from './privacy-consent-state';

const now = 1_800_000_000_000;

function memoryStorage(): PrivacyConsentStorage {
  const entries = new Map<string, string>();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
    removeItem: (key) => {
      entries.delete(key);
    },
  };
}

describe('privacy choice states', () => {
  it('distinguishes no record, invalid/expired record, and unavailable storage', () => {
    const storage = memoryStorage();
    expect(loadPrivacyConsentState({ storage, now })).toEqual({
      kind: 'prompt',
      reason: 'absent',
    });
    storage.setItem(PRIVACY_CONSENT_STORAGE_KEY, '{broken');
    expect(loadPrivacyConsentState({ storage, now })).toEqual({
      kind: 'prompt',
      reason: 'stale',
    });
    savePrivacyConsent({
      storage,
      analytics: true,
      marketing: false,
      now: now - PRIVACY_CONSENT_MAX_AGE_MS,
    });
    expect(loadPrivacyConsentState({ storage, now })).toEqual({
      kind: 'prompt',
      reason: 'stale',
    });
    expect(loadPrivacyConsentState({ storage: null, now })).toEqual({
      kind: 'prompt',
      reason: 'unavailable',
    });
    expect(
      loadPrivacyConsentState({
        storage: {
          ...storage,
          getItem: () => {
            throw new Error('blocked');
          },
        },
        now,
      })
    ).toEqual({ kind: 'prompt', reason: 'unavailable' });
  });

  it('keeps an explicit rejected choice saved rather than prompting again', () => {
    const storage = memoryStorage();
    const rejected = savePrivacyConsent({
      storage,
      analytics: false,
      marketing: false,
      now,
    });
    if (!rejected.ok) throw new Error('Fixture must persist');
    expect(loadPrivacyConsentState({ storage, now })).toEqual({
      kind: 'saved',
      choice: rejected.choice,
    });
    const state = transitionPrivacyConsentState(
      { kind: 'initial' },
      { kind: 'restore', state: loadPrivacyConsentState({ storage, now }) }
    );
    expect(state).toEqual({ kind: 'saved', choice: rejected.choice });
  });

  it('does not resurrect accepted state after failed withdrawal, and permits an explicit retry', () => {
    const storage = memoryStorage();
    const accepted = savePrivacyConsent({
      storage,
      analytics: true,
      marketing: false,
      now,
    });
    if (!accepted.ok) throw new Error('Fixture must persist');
    let state: PrivacyConsentState = loadPrivacyConsentState({ storage, now });
    const blocked = {
      ...storage,
      setItem: () => {
        throw new Error('read-only');
      },
      removeItem: () => {
        throw new Error('read-only');
      },
    };
    const denied = savePrivacyConsent({
      storage: blocked,
      analytics: false,
      marketing: false,
      now,
    });
    expect(denied.ok).toBe(false);
    state = transitionPrivacyConsentState(state, { kind: 'save-failed' });
    // The old accepted record remains readable when writes and deletion are blocked.
    expect(loadPrivacyConsentState({ storage: blocked, now })).toEqual({
      kind: 'saved',
      choice: accepted.choice,
    });
    state = transitionPrivacyConsentState(state, {
      kind: 'restore',
      state: loadPrivacyConsentState({ storage: blocked, now }),
    });
    expect(state).toEqual({ kind: 'save-error' });
    const retried = savePrivacyConsent({
      storage,
      analytics: false,
      marketing: false,
      now,
    });
    if (!retried.ok) throw new Error('Retry must persist');
    state = transitionPrivacyConsentState(state, {
      kind: 'save-succeeded',
      choice: retried.choice,
    });
    expect(state).toEqual({ kind: 'saved', choice: retried.choice });
  });

  it('admits save events only after client initialization', () => {
    expect(
      transitionPrivacyConsentState(
        { kind: 'initial' },
        { kind: 'save-failed' }
      )
    ).toEqual({ kind: 'initial' });
    const saved = savePrivacyConsent({
      storage: memoryStorage(),
      analytics: true,
      marketing: false,
      now,
    });
    if (!saved.ok) throw new Error('Fixture must persist');
    expect(
      transitionPrivacyConsentState(
        { kind: 'initial' },
        { kind: 'save-succeeded', choice: saved.choice }
      )
    ).toEqual({ kind: 'initial' });
  });
});
