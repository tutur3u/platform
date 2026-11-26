/**
 * The label the sign-in screens show for the signed-in account. A profile
 * name wins; accounts without one (email sign-ups that skipped the optional
 * onboarding name, QA accounts) fall back to the handle, then to a masked
 * email, before the screen's "unknown account" copy.
 */
export function maskEmailForDisplay(email: string | null | undefined) {
  const trimmed = email?.trim();
  if (!trimmed) return null;

  const at = trimmed.lastIndexOf('@');
  if (at <= 0 || at === trimmed.length - 1) return null;

  return `${trimmed[0]}•••${trimmed.slice(at)}`;
}

function readName(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function resolveSessionAccountName({
  displayName,
  email,
  handle,
  metadata,
}: {
  displayName?: unknown;
  email?: string | null;
  handle?: unknown;
  metadata?: Record<string, unknown>;
}) {
  const handleName = readName(handle);

  return (
    readName(displayName) ??
    readName(metadata?.full_name) ??
    readName(metadata?.name) ??
    (handleName ? `@${handleName.replace(/^@+/u, '')}` : null) ??
    maskEmailForDisplay(email)
  );
}
