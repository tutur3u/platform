/** Apply only to an authenticated account email, never editable profile metadata. */
export function canCreateOnlineMeeting(
  email: string | null | undefined
): boolean {
  return typeof email === 'string' && /^[^\s@]+@tuturuuu\.com$/iu.test(email);
}
