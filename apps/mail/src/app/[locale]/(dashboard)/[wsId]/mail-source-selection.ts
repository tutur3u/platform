import { isMailFolder, type MailFolder } from './mail-folders';

/** Folders every connected Gmail or Outlook account exposes. */
export const CONNECTED_MAIL_FOLDERS = [
  'inbox',
  'sent',
  'drafts',
  'archive',
  'spam',
  'trash',
] as const satisfies readonly MailFolder[];

export type ConnectedMailFolder = (typeof CONNECTED_MAIL_FOLDERS)[number];

export function isConnectedMailFolder(
  folder: string | null | undefined
): folder is ConnectedMailFolder {
  return (CONNECTED_MAIL_FOLDERS as readonly string[]).includes(folder ?? '');
}

/** Managed-only folders (snoozed, muted, starred) fall back to the inbox. */
export function resolveConnectedMailFolder(
  folder: string | null | undefined
): ConnectedMailFolder {
  return isConnectedMailFolder(folder) ? folder : 'inbox';
}

export type MailSelection =
  | { kind: 'managed'; mailboxId: string }
  | { kind: 'connected'; accountId: string };

/** Params that belong to one source and must not leak into the other. */
const MANAGED_ONLY_PARAMS = ['mailbox', 'folderId', 'label'] as const;

/**
 * URL for choosing a mailbox or connected account. `connected` is written
 * explicitly for managed selections only when connected is the default source,
 * otherwise the absent parameter already means managed.
 */
export function applyMailSelection(
  current: URLSearchParams | string,
  selection: MailSelection,
  connectedByDefault: boolean
) {
  const params = new URLSearchParams(current);
  params.delete('thread');
  if (selection.kind === 'connected') {
    for (const key of MANAGED_ONLY_PARAMS) params.delete(key);
    params.set('connected', '1');
    params.set('account', selection.accountId);
    return params;
  }
  params.delete('account');
  params.set('mailbox', selection.mailboxId);
  if (connectedByDefault) params.set('connected', '');
  else params.delete('connected');
  return params;
}

/** Folder link that keeps the active mailbox or connected account selected. */
export function getSourceFolderHref({
  accountId,
  composing,
  href,
  mailboxId,
  source,
}: {
  accountId: string | null;
  composing: boolean;
  href: string | undefined;
  mailboxId: string | null;
  source: 'connected' | 'managed';
}) {
  if (!href) return '#';
  const params = new URLSearchParams();
  if (source === 'connected') {
    params.set('connected', '1');
    if (accountId) params.set('account', accountId);
  } else if (mailboxId) {
    params.set('connected', '');
    params.set('mailbox', mailboxId);
  } else {
    return href;
  }
  if (composing) params.set('compose', '1');
  return `${href.split('?')[0]}?${params}`;
}

/** The requested account when it still exists, otherwise the first one. */
export function resolveConnectedAccountId(
  accounts: readonly { id: string }[] | undefined,
  requested: string | null
) {
  if (!accounts) return requested;
  return (
    (accounts.find((item) => item.id === requested) ?? accounts[0])?.id ?? null
  );
}

/**
 * Choosing a connected account while on a managed-only folder (snoozed, muted,
 * starred) lands on the inbox so the sidebar highlight matches the pane.
 */
export function resolveSelectionPathname(
  pathname: string,
  selection: MailSelection
) {
  if (selection.kind !== 'connected') return pathname;
  const segments = pathname.split('/');
  const last = segments.at(-1);
  if (!last || !isMailFolder(last) || isConnectedMailFolder(last)) {
    return pathname;
  }
  segments[segments.length - 1] = 'inbox';
  return segments.join('/');
}
