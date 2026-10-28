'use client';

import { useSyncExternalStore } from 'react';

/**
 * The default mailbox is only known after bootstrap. Remembering the last
 * resolved default lets the thread list start in parallel with bootstrap on
 * the next visit; the server still authorizes every mailbox ID.
 */
const keyFor = (workspaceId: string) =>
  `tuturuuu-mail-default-mailbox:${workspaceId}`;

export function rememberDefaultMailbox(
  workspaceId: string,
  mailboxId: string | undefined
) {
  if (!mailboxId) return;
  try {
    window.localStorage.setItem(keyFor(workspaceId), mailboxId);
  } catch {
    // Storage can be unavailable; the hint is only an optimization.
  }
}

function readHint(workspaceId: string) {
  try {
    return window.localStorage.getItem(keyFor(workspaceId));
  } catch {
    return null;
  }
}

const noop = () => () => undefined;

export function useMailboxHint(workspaceId: string) {
  return useSyncExternalStore(
    noop,
    () => readHint(workspaceId),
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
