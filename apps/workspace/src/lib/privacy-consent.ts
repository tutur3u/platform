export const PRIVACY_CONSENT_STORAGE_KEY = 'tuturuuu:privacy-consent';
export const PRIVACY_CONSENT_VERSION = 1;
export const PRIVACY_POLICY_VERSION = '2026-11-08-draft';
export const PRIVACY_CONSENT_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;

export interface PrivacyConsent {
  version: typeof PRIVACY_CONSENT_VERSION;
  policyVersion: typeof PRIVACY_POLICY_VERSION;
  updatedAt: number;
  strictlyNecessary: true;
  analytics: boolean;
  marketing: boolean;
}

export interface PrivacyConsentStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PrivacyProvider {
  id: string;
  purpose: 'analytics' | 'marketing';
  enabled: boolean;
}

// Provider activation requires a separate USER decision; this delivery collects nothing.
export const PRIVACY_PROVIDERS: readonly PrivacyProvider[] = [];

function isCurrentPrivacyConsent(
  value: unknown,
  now: number
): value is PrivacyConsent {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.keys(value).length === 6 &&
    'version' in value &&
    value.version === PRIVACY_CONSENT_VERSION &&
    'policyVersion' in value &&
    value.policyVersion === PRIVACY_POLICY_VERSION &&
    'updatedAt' in value &&
    typeof value.updatedAt === 'number' &&
    Number.isFinite(value.updatedAt) &&
    Number.isFinite(now) &&
    value.updatedAt >= 0 &&
    value.updatedAt <= now &&
    now - value.updatedAt < PRIVACY_CONSENT_MAX_AGE_MS &&
    'strictlyNecessary' in value &&
    value.strictlyNecessary === true &&
    'analytics' in value &&
    typeof value.analytics === 'boolean' &&
    'marketing' in value &&
    typeof value.marketing === 'boolean'
  );
}

export function readPrivacyConsent({
  storage,
  now = Date.now(),
}: {
  storage: PrivacyConsentStorage | null;
  now?: number;
}): PrivacyConsent | null {
  try {
    const raw = storage?.getItem(PRIVACY_CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isCurrentPrivacyConsent(parsed, now) ? parsed : null;
  } catch {
    return null;
  }
}

export function savePrivacyConsent({
  storage,
  analytics,
  marketing,
  now = Date.now(),
}: {
  storage: PrivacyConsentStorage | null;
  analytics: boolean;
  marketing: boolean;
  now?: number;
}): { ok: true; choice: PrivacyConsent } | { ok: false; choice: null } {
  const choice: PrivacyConsent = {
    version: PRIVACY_CONSENT_VERSION,
    policyVersion: PRIVACY_POLICY_VERSION,
    updatedAt: now,
    strictlyNecessary: true,
    analytics,
    marketing,
  };

  try {
    if (!storage || !isCurrentPrivacyConsent(choice, now)) {
      return { ok: false, choice: null };
    }
    storage.setItem(PRIVACY_CONSENT_STORAGE_KEY, JSON.stringify(choice));
    if (
      storage.getItem(PRIVACY_CONSENT_STORAGE_KEY) !== JSON.stringify(choice)
    ) {
      throw new Error('Privacy preference was not persisted');
    }
    return { ok: true, choice };
  } catch {
    try {
      storage?.removeItem(PRIVACY_CONSENT_STORAGE_KEY);
    } catch {
      // Unavailable storage cannot guarantee persistence; callers retain denial.
    }
    return { ok: false, choice: null };
  }
}

export function getAllowedPrivacyPurposes({
  choice,
  providers = PRIVACY_PROVIDERS,
  now = Date.now(),
}: {
  choice: PrivacyConsent | null;
  providers?: readonly PrivacyProvider[];
  now?: number;
}): { strictlyNecessary: true; analytics: boolean; marketing: boolean } {
  const current = isCurrentPrivacyConsent(choice, now) ? choice : null;
  return {
    strictlyNecessary: true,
    analytics:
      current?.analytics === true &&
      providers.some(
        ({ enabled, purpose }) => enabled && purpose === 'analytics'
      ),
    marketing:
      current?.marketing === true &&
      providers.some(
        ({ enabled, purpose }) => enabled && purpose === 'marketing'
      ),
  };
}
