import { TOPIC_ANNOUNCEMENTS_SECRET } from '@tuturuuu/utils/topic-announcements';

/**
 * Workspace *secrets* (not configs) that act purely as module on/off switches
 * for the Contacts surface.
 *
 * Secrets can hold credentials, so this route deliberately refuses to be a
 * general secrets endpoint: only these names are addressable, and only the
 * literal strings `true` and `false` may be written. Anything else belongs in
 * the platform Settings → Secrets screen, which is permission-gated separately.
 */
export const CONTACTS_FEATURE_SECRET_NAMES = new Set<string>([
  TOPIC_ANNOUNCEMENTS_SECRET,
]);

export function isContactsFeatureSecretName(name: string) {
  return CONTACTS_FEATURE_SECRET_NAMES.has(name);
}

export function isContactsFeatureSecretValue(
  value: string
): value is 'false' | 'true' {
  return value === 'true' || value === 'false';
}
