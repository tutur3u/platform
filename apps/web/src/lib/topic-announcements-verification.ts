import { createHash, randomBytes } from 'node:crypto';
import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';

const TOPIC_ANNOUNCEMENT_VERIFICATION_FALLBACK_ORIGIN = 'https://tuturuuu.com';

export function hashTopicAnnouncementVerificationToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function generateTopicAnnouncementVerificationToken() {
  return randomBytes(32).toString('base64url');
}

function isLocalVerificationOrigin(value: string) {
  try {
    const { hostname } = new URL(value);
    return (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname === '0.0.0.0' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '[::1]'
    );
  } catch {
    return true;
  }
}

function resolveVerificationOriginCandidate(value?: string | null) {
  if (!value?.trim()) return null;

  const resolved = resolveInternalAppUrl({
    appName: 'platform',
    candidates: [value],
    fallback: '',
  });

  return resolved || null;
}

export function getTopicAnnouncementVerificationOrigin() {
  const explicitOrigin = resolveVerificationOriginCandidate(
    process.env.TOPIC_ANNOUNCEMENT_VERIFICATION_ORIGIN
  );

  if (explicitOrigin) {
    return explicitOrigin;
  }

  for (const candidate of [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_WEB_APP_URL,
    process.env.WEB_APP_URL,
  ]) {
    const resolved = resolveVerificationOriginCandidate(candidate);

    if (resolved && !isLocalVerificationOrigin(resolved)) {
      return resolved;
    }
  }

  return TOPIC_ANNOUNCEMENT_VERIFICATION_FALLBACK_ORIGIN;
}

export function buildTopicAnnouncementVerificationUrl(token: string) {
  return `${getTopicAnnouncementVerificationOrigin()}/api/v1/topic-announcement-verifications/${encodeURIComponent(token)}`;
}
