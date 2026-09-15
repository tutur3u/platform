/** Use a current authenticated email and server-resolved personal subscription tier. */
export function canCreateOnlineMeeting(
  email: string | null | undefined,
  tier: string = 'FREE'
): boolean {
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+$/u.test(email))
    return false;
  return (
    /^[^\s@]+@tuturuuu\.com$/iu.test(email) ||
    ['PLUS', 'PRO', 'ENTERPRISE'].includes(tier)
  );
}
