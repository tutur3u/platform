import type { ResolvedWorkspacePerson } from '@tuturuuu/internal-api/people';

/**
 * Whether the resolver allows this person's email address to be shown.
 * Unresolved and unknown people keep the address from the message itself.
 */
export function mailPersonEmailVisible(
  person: ResolvedWorkspacePerson | undefined
) {
  if (!person || person.kind === 'unknown') return true;
  return person.emailVisible;
}

/**
 * The name shown for a mail participant: the workspace identity first, then
 * the header name, then the address unless the workspace hides it.
 */
export function mailPersonDisplayName(
  person: ResolvedWorkspacePerson | undefined,
  headerName: string | null | undefined,
  address: string,
  hiddenFallback: string
) {
  const resolved =
    person && person.kind !== 'unknown' ? person.displayName?.trim() : '';
  return (
    resolved ||
    headerName?.trim() ||
    (mailPersonEmailVisible(person) ? address.trim() : hiddenFallback)
  );
}

export function mailAddressDomain(address: string) {
  const at = address.lastIndexOf('@');
  return at < 0
    ? ''
    : address
        .slice(at + 1)
        .trim()
        .toLowerCase();
}

/** Keeps the first `max` recipients visible and counts the rest. */
export function collapseMailRecipients<T>(items: readonly T[], max = 2) {
  const limit = Math.max(0, max);
  return {
    visible: items.slice(0, limit),
    hidden: Math.max(0, items.length - limit),
  };
}
