export const MFA_MOBILE_APPROVAL_KIND = 'mfa_mobile_approval';
export const MFA_MOBILE_APPROVAL_COOKIE_NAME = 'ttr_mfa_mobile_approval';
export const MFA_MOBILE_APPROVAL_CHALLENGE_TTL_SECONDS = 5 * 60;
export const MFA_MOBILE_APPROVAL_SESSION_TTL_SECONDS = 12 * 60 * 60;
export const MFA_MOBILE_APPROVAL_COOKIE_MAX_AGE_SECONDS =
  MFA_MOBILE_APPROVAL_SESSION_TTL_SECONDS;

const PAIR_CODE_ALPHABET = '0123456789';
const SECRET_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export interface MfaMobileApprovalCookiePayload {
  challengeId: string;
  secret: string;
}

function getWebCrypto() {
  const crypto = globalThis.crypto;

  if (!crypto?.getRandomValues || !crypto.subtle) {
    throw new Error('Web Crypto is required for mobile MFA approvals');
  }

  return crypto;
}

function randomString(length: number, alphabet: string) {
  const crypto = getWebCrypto();
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

export function generateMfaMobileApprovalSecret() {
  return randomString(48, SECRET_ALPHABET);
}

export function generateMfaMobileApprovalPairCode() {
  const code = randomString(6, PAIR_CODE_ALPHABET);
  return code;
}

export function normalizeMfaMobileApprovalPairCode(value: string) {
  return value.replace(/[^a-z0-9]/giu, '').toUpperCase();
}

export async function hashMfaMobileApprovalSecret(secret: string) {
  const digest = await getWebCrypto().subtle.digest(
    'SHA-256',
    new TextEncoder().encode(secret)
  );

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

export function buildMfaMobileApprovalCookieValue(
  payload: MfaMobileApprovalCookiePayload
) {
  return `${payload.challengeId}.${payload.secret}`;
}

export function parseMfaMobileApprovalCookie(
  value: string | undefined
): MfaMobileApprovalCookiePayload | null {
  if (!value) {
    return null;
  }

  const separatorIndex = value.indexOf('.');
  if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
    return null;
  }

  const challengeId = value.slice(0, separatorIndex);
  const secret = value.slice(separatorIndex + 1);

  if (!challengeId || !secret) {
    return null;
  }

  return { challengeId, secret };
}
