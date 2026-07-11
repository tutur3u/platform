export function resolveInternalMailboxName(
  userDisplayName: string | null | undefined,
  address: string
) {
  return userDisplayName?.trim() || address;
}
