import {
  type PrivacyConsent,
  type PrivacyConsentStorage,
  PRIVACY_CONSENT_STORAGE_KEY,
  readPrivacyConsent,
} from './privacy-consent';

type RestoredPrivacyConsentState =
  | { kind: 'prompt'; reason: 'absent' | 'stale' | 'unavailable' }
  | { kind: 'saved'; choice: PrivacyConsent };

export type PrivacyConsentState =
  | { kind: 'initial' }
  | RestoredPrivacyConsentState
  | { kind: 'save-error' };

type PrivacyConsentEvent =
  | { kind: 'restore'; state: RestoredPrivacyConsentState }
  | { kind: 'save-succeeded'; choice: PrivacyConsent }
  | { kind: 'save-failed' };

export function loadPrivacyConsentState({
  storage,
  now = Date.now(),
}: {
  storage: PrivacyConsentStorage | null;
  now?: number;
}): RestoredPrivacyConsentState {
  if (!storage) return { kind: 'prompt', reason: 'unavailable' };
  try {
    if (storage.getItem(PRIVACY_CONSENT_STORAGE_KEY) === null) {
      return { kind: 'prompt', reason: 'absent' };
    }
    const choice = readPrivacyConsent({ storage, now });
    return choice
      ? { kind: 'saved', choice }
      : { kind: 'prompt', reason: 'stale' };
  } catch {
    return { kind: 'prompt', reason: 'unavailable' };
  }
}

export function transitionPrivacyConsentState(
  state: PrivacyConsentState,
  event: PrivacyConsentEvent
): PrivacyConsentState {
  switch (event.kind) {
    case 'restore':
      // Failed persistence must not restore a previously accepted disk record.
      return state.kind === 'save-error' ? state : event.state;
    case 'save-succeeded':
      return state.kind === 'initial'
        ? state
        : { kind: 'saved', choice: event.choice };
    case 'save-failed':
      return state.kind === 'initial' ? state : { kind: 'save-error' };
    default: {
      const unreachable: never = event;
      return unreachable;
    }
  }
}
