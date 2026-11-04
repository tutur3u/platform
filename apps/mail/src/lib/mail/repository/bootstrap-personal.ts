import { resolveInternalMailboxName } from '../identity';
import type { MailRouteContext } from '../types';
import {
  type AnyRecord,
  getCanonicalUserDisplayName,
  normalizeAddress,
  privateTable,
  SYSTEM_LABELS,
} from './shared';

export type MailMemberRow = { mailbox_id: string; role: string };

/**
 * Resolve the caller's personal mailbox together with their memberships.
 * Reads run in one parallel stage; identity, membership and label writes only
 * run when the stored state differs, so an ordinary bootstrap is read-only.
 */
export async function resolvePersonalMailbox(
  admin: AnyRecord,
  ctx: MailRouteContext
) {
  const email = normalizeAddress(ctx.user.email ?? '');
  const [displayName, existing, memberRows] = await Promise.all([
    getCanonicalUserDisplayName(admin, ctx.user.id),
    privateTable(admin, 'mail_mailboxes')
      .select('*')
      .eq('address', email)
      .maybeSingle()
      .then(({ data, error }: AnyRecord) => {
        if (error)
          throw new Error(`Failed to load mail mailbox: ${error.message}`);
        return data as AnyRecord | null;
      }),
    loadMemberRows(admin, ctx.user.id),
  ]);
  const canonicalName = resolveInternalMailboxName(displayName, email);
  const mailbox = existing
    ? await synchronizeIdentity(admin, existing, ctx.user.id, canonicalName)
    : await createPersonalMailbox(admin, email, ctx.user.id, canonicalName);

  // A personal mailbox always belongs to its owner, mirroring the upsert below.
  const current = memberRows.find((row) => row.mailbox_id === mailbox.id);
  if (current?.role !== 'owner') {
    const { error } = await privateTable(admin, 'mail_mailbox_members').upsert(
      {
        created_by: ctx.user.id,
        mailbox_id: mailbox.id,
        role: 'owner',
        user_id: ctx.user.id,
      },
      { onConflict: 'mailbox_id,user_id' }
    );
    if (error) {
      throw new Error(
        `Failed to create mail mailbox membership: ${error.message}`
      );
    }
  }

  return {
    displayName,
    mailbox,
    memberRows: [
      ...memberRows.filter((row) => row.mailbox_id !== mailbox.id),
      { mailbox_id: mailbox.id as string, role: 'owner' },
    ],
  };
}

async function loadMemberRows(admin: AnyRecord, userId: string) {
  const { data, error } = await privateTable(admin, 'mail_mailbox_members')
    .select('mailbox_id, role')
    .eq('user_id', userId);
  if (error) {
    throw new Error(`Failed to load mail memberships: ${error.message}`);
  }
  return (data ?? []) as MailMemberRow[];
}

async function synchronizeIdentity(
  admin: AnyRecord,
  mailbox: AnyRecord,
  userId: string,
  canonicalName: string
) {
  if (
    mailbox.type !== 'personal' ||
    (mailbox.created_by === userId &&
      mailbox.display_name === canonicalName &&
      mailbox.sender_name === canonicalName)
  )
    return mailbox;

  const { data, error } = await privateTable(admin, 'mail_mailboxes')
    .update({
      created_by: userId,
      display_name: canonicalName,
      sender_name: canonicalName,
    })
    .eq('id', mailbox.id)
    .select('*')
    .single();
  if (error) {
    throw new Error(`Failed to synchronize mailbox identity: ${error.message}`);
  }
  return data as AnyRecord;
}

async function createPersonalMailbox(
  admin: AnyRecord,
  email: string,
  userId: string,
  canonicalName: string
) {
  const { data: mailDomain, error: domainError } = await privateTable(
    admin,
    'mail_domains'
  )
    .select('id')
    .eq('domain', email.split('@')[1])
    .eq('status', 'active')
    .maybeSingle();
  if (domainError) {
    throw new Error(`Failed to load mail domain: ${domainError.message}`);
  }
  if (!mailDomain?.id) {
    throw new Error('No active mail domain is configured for this address');
  }

  const { data, error } = await privateTable(admin, 'mail_mailboxes')
    .insert({
      address: email,
      created_by: userId,
      display_name: canonicalName,
      domain_id: mailDomain.id,
      sender_name: canonicalName,
      type: 'personal',
    })
    .select('*')
    .single();
  if (error) {
    throw new Error(`Failed to create mail mailbox: ${error.message}`);
  }
  return data as AnyRecord;
}

/** True when every system label exists with its canonical name and kind. */
export function hasSystemLabels(labels: AnyRecord[], mailboxId: string) {
  return SYSTEM_LABELS.every((label) =>
    labels.some(
      (row) =>
        row.mailbox_id === mailboxId &&
        row.slug === label.slug &&
        row.name === label.name &&
        row.kind === label.kind
    )
  );
}
