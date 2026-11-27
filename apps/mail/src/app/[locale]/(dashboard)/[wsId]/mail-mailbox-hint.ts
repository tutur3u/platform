'use client';

import { useSyncExternalStore } from 'react';

/**
 * The default mailbox is only known after bootstrap. Remembering the last
 * resolved default per account and workspace lets the thread list start in
 * parallel with bootstrap on the next visit without bleeding across accounts;
 * the server still authorizes every mailbox ID.
 */
const keyFor = (workspaceId: string, actorId?: string | null) =>
  actorId
    ? `tuturuuu-mail-default-mailbox:${actorId}:${workspaceId}`
    : `tuturuuu-mail-default-mailbox:${workspaceId}`;

export function rememberDefaultMailbox(
  workspaceId: string,
  mailboxId: string | undefined,
  actorId?: string | null
) {
  try {
    const key = keyFor(workspaceId, actorId);
    if (mailboxId) window.localStorage.setItem(key, mailboxId);
    else window.localStorage.removeItem(key);
  } catch {
    // Storage can be unavailable; the hint is only an optimization.
  }
}

function readHint(workspaceId: string, actorId?: string | null) {
  try {
    return window.localStorage.getItem(keyFor(workspaceId, actorId));
  } catch {
    return null;
  }
}

const noop = () => () => undefined;

export function useMailboxHint(workspaceId: string, actorId?: string | null) {
  return useSyncExternalStore(
    noop,
    () => readHint(workspaceId, actorId),
    () => null
  );
}

/** Before bootstrap, trust the URL or hint; afterwards, only known mailboxes. */
export function resolveActiveMailboxId({
  hint,
  mailboxes,
  requested,
}: {
  hint: string | null;
  mailboxes: { id: string }[] | undefined;
  requested: string | null;
}) {
  if (!mailboxes) return requested ?? hint ?? null;
  return (
    (mailboxes.find((mailbox) => mailbox.id === requested) ?? mailboxes[0])
      ?.id ?? null
  );
}
