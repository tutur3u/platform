export function normalizeParleyEmail(email: string | null | undefined) {
  const normalized = email?.trim().toLowerCase() ?? '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized) ? normalized : null;
}
export function hasInternalParleyDomain(email: string) {
  return email.split('@').length === 2 && email.endsWith('@tuturuuu.com');
}
