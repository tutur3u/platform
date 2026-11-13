const TUTURUUU_ACCOUNT_DOMAIN = 'tuturuuu.com';

/** Temporary D57 gate. Replace with the shared experimental-audience rule. */
export function isTuturuuuExperimentalAccount(
  email: string | null | undefined
): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf('@');
  if (at <= 0 || /\s/.test(normalized)) return false;
  return normalized.slice(at + 1) === TUTURUUU_ACCOUNT_DOMAIN;
}
