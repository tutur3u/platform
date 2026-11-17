import { moveBlockedMailAndConsumeNotifications } from '../repository/notification-consumption';
import { requireMailboxAccess } from '../repository/bootstrap';
import { type AnyRecord, privateTable } from '../repository/shared';
import type { MailRouteContext } from '../types';
import {
  exactLikePattern,
  matchesSenderBlock,
  normalizeSenderBlock,
  type SenderBlockKind,
  type SenderBlockRule,
  senderBlockCandidates,
  senderDomain,
} from './match';
import { isMissingSchemaError } from '../schema-compat';

const MAX_BLOCKS_PER_MAILBOX = 1_000;
const MAX_MOVED_MESSAGES = 5_000;

export type MailSenderBlock = {
  id: string;
  kind: SenderBlockKind;
  value: string;
  createdAt: string;
  createdBy: string | null;
};

function toBlock(row: AnyRecord): MailSenderBlock {
  return {
    id: row.id,
    kind: row.kind,
    value: row.value,
    createdAt: row.created_at,
    createdBy: row.created_by ?? null,
  };
}

/**
 * Ingest-time check. A failed lookup delivers to the inbox: blocking is a
 * preference, and losing or retrying mail over it would be worse.
 */
export async function isSenderBlocked(
  admin: AnyRecord,
  mailboxId: string,
  address: string | null | undefined
) {
  const candidates = senderBlockCandidates(address);
  if (!candidates.length) return false;
  try {
    const { data, error } = await privateTable(admin, 'mail_sender_blocks')
      .select('kind, value')
      .eq('mailbox_id', mailboxId)
      .in(
        'value',
        candidates.map((candidate) => candidate.value)
      );
    if (error) throw error;
    return matchesSenderBlock(address, (data ?? []) as SenderBlockRule[]);
  } catch {
    console.warn('Sender block lookup failed; delivering to inbox');
    return false;
  }
}

export async function listSenderBlocks({
  ctx,
  mailboxId,
}: {
  ctx: MailRouteContext;
  mailboxId: string;
}) {
  const access = await requireMailboxAccess(ctx, mailboxId);
  if (!access) return null;
  const { data, error } = await privateTable(access.admin, 'mail_sender_blocks')
    .select('id, kind, value, created_at, created_by')
    .eq('mailbox_id', mailboxId)
    .order('created_at', { ascending: false })
    .limit(MAX_BLOCKS_PER_MAILBOX);
  // Before the sender-block migration applies, the mailbox has no blocks.
  if (error && isMissingSchemaError(error)) return [];
  if (error) throw new Error('Failed to load sender blocks');
  return (data ?? []).map(toBlock);
}

async function mailboxWorkspace(admin: AnyRecord, mailboxId: string) {
  const { data, error } = await privateTable(admin, 'mail_mailboxes')
    .select('ws_id')
    .eq('id', mailboxId)
    .maybeSingle();
  if (error) throw new Error('Failed to load mailbox workspace');
  return (data?.ws_id as string | null | undefined) ?? null;
}

/**
 * Mirrors block state onto the workspace's contacts: a contact is
 * `mail_blocked` while any mailbox linked to its workspace blocks its address
 * or domain.
 */
export async function syncContactBlockFlags(
  admin: AnyRecord,
  wsId: string | null,
  rule: SenderBlockRule
) {
  if (!wsId) return;
  const pattern =
    rule.kind === 'address' ? exactLikePattern(rule.value) : `%@${rule.value}`;
  const subdomainPattern = `%.${rule.value}`;
  let contactsQuery = admin
    .from('workspace_users')
    .select('id, email, mail_blocked')
    .eq('ws_id', wsId);
  contactsQuery =
    rule.kind === 'address'
      ? contactsQuery.ilike('email', pattern)
      : contactsQuery.or(
          `email.ilike.${pattern},email.ilike.${subdomainPattern}`
        );
  const { data: contacts, error } = await contactsQuery.limit(500);
  if (error) throw new Error('Failed to load contacts for block sync');
  if (!contacts?.length) return;

  const { data: mailboxes, error: mailboxError } = await privateTable(
    admin,
    'mail_mailboxes'
  )
    .select('id')
    .eq('ws_id', wsId);
  if (mailboxError) throw new Error('Failed to load workspace mailboxes');
  const mailboxIds = (mailboxes ?? []).map((row: AnyRecord) => row.id);
  const domains = new Set(
    contacts.flatMap((contact: AnyRecord) =>
      senderBlockCandidates(contact.email)
        .filter((candidate) => candidate.kind === 'domain')
        .map((candidate) => candidate.value)
    )
  );
  const values = [
    ...new Set([
      ...contacts.map((contact: AnyRecord) =>
        String(contact.email).toLowerCase()
      ),
      ...domains,
    ]),
  ];
  const { data: rules, error: rulesError } = mailboxIds.length
    ? await privateTable(admin, 'mail_sender_blocks')
        .select('kind, value')
        .in('mailbox_id', mailboxIds)
        .in('value', values)
    : { data: [], error: null };
  if (rulesError) throw new Error('Failed to load sender blocks for sync');

  for (const contact of contacts as AnyRecord[]) {
    const blocked = matchesSenderBlock(contact.email, rules ?? []);
    if (blocked === contact.mail_blocked) continue;
    const { error: updateError } = await admin
      .from('workspace_users')
      .update({ mail_blocked: blocked })
      .eq('id', contact.id)
      .eq('ws_id', wsId);
    if (updateError) throw new Error('Failed to update contact block flag');
  }
}

/**
 * Moves a sender's existing inbound mail into or out of Blocked by adding or
 * removing the system `blocked` label; the inbox label is left alone, so no
 * push is raised. Unblocking releases only mail that no remaining rule of
 * the mailbox still covers.
 */
async function relabelSenderMail(
  admin: AnyRecord,
  mailboxId: string,
  rule: SenderBlockRule,
  direction: 'block' | 'unblock',
  actorId?: string
) {
  let query = privateTable(admin, 'mail_messages')
    .select('id, from_address')
    .eq('mailbox_id', mailboxId)
    .eq('direction', 'inbound');
  query =
    rule.kind === 'address'
      ? query.ilike('from_address', exactLikePattern(rule.value))
      : query.or(
          `from_address.ilike.%@${rule.value},from_address.ilike.%.${rule.value}`
        );
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(MAX_MOVED_MESSAGES);
  if (error) throw new Error('Failed to load sender mail');

  let remaining: SenderBlockRule[] = [];
  if (direction === 'unblock') {
    const { data: rules, error: rulesError } = await privateTable(
      admin,
      'mail_sender_blocks'
    )
      .select('kind, value')
      .eq('mailbox_id', mailboxId)
      .limit(MAX_BLOCKS_PER_MAILBOX);
    if (rulesError) throw new Error('Failed to load sender blocks');
    remaining = (rules ?? []) as SenderBlockRule[];
  }
  const ids: string[] = (data ?? [])
    .filter(
      (row: AnyRecord) =>
        matchesSenderBlock(row.from_address, [rule]) &&
        !matchesSenderBlock(row.from_address, remaining)
    )
    .map((row: AnyRecord) => row.id as string);
  if (!ids.length) return 0;

  const { data: label, error: labelError } = await privateTable(
    admin,
    'mail_labels'
  )
    .select('id')
    .eq('mailbox_id', mailboxId)
    .eq('slug', 'blocked')
    .eq('kind', 'system')
    .maybeSingle();
  if (labelError || !label?.id) throw new Error('Missing system label');

  for (let start = 0; start < ids.length; start += 500) {
    const chunk = ids.slice(start, start + 500);
    if (direction === 'block') {
      if (!actorId) throw new Error('Mailbox actor required');
      await moveBlockedMailAndConsumeNotifications({
        admin,
        mailboxId,
        userId: actorId,
        labelId: label.id,
        messageIds: chunk,
      });
    } else {
      const { error } = await privateTable(admin, 'mail_message_labels')
        .delete()
        .eq('label_id', label.id)
        .in('message_id', chunk);
      if (error) throw new Error('Failed to move sender mail');
    }
  }
  return ids.length;
}

export async function addSenderBlock({
  ctx,
  mailboxId,
  kind,
  value,
  moveExisting,
}: {
  ctx: MailRouteContext;
  mailboxId: string;
  kind: SenderBlockKind;
  value: string;
  moveExisting: boolean;
}) {
  const access = await requireMailboxAccess(ctx, mailboxId, ['owner', 'admin']);
  if (!access) return { status: 'forbidden' as const };
  const rule = normalizeSenderBlock(kind, value);
  if (!rule) return { status: 'invalid' as const };
  const { admin } = access;

  const { count, error: countError } = await privateTable(
    admin,
    'mail_sender_blocks'
  )
    .select('id', { count: 'exact', head: true })
    .eq('mailbox_id', mailboxId);
  if (countError) throw new Error('Failed to count sender blocks');
  if ((count ?? 0) >= MAX_BLOCKS_PER_MAILBOX)
    return { status: 'limit' as const };

  const wsId = await mailboxWorkspace(admin, mailboxId);
  let contactId: string | null = null;
  if (wsId && rule.kind === 'address') {
    const { data: contact } = await admin
      .from('workspace_users')
      .select('id')
      .eq('ws_id', wsId)
      .ilike('email', exactLikePattern(rule.value))
      .limit(1)
      .maybeSingle();
    contactId = contact?.id ?? null;
  }

  const { data, error } = await privateTable(admin, 'mail_sender_blocks')
    .upsert(
      {
        mailbox_id: mailboxId,
        kind: rule.kind,
        value: rule.value,
        contact_id: contactId,
        created_by: ctx.user.id,
      },
      { onConflict: 'mailbox_id,kind,value', ignoreDuplicates: false }
    )
    .select('id, kind, value, created_at, created_by')
    .single();
  if (error) throw new Error('Failed to save sender block');

  const moved = moveExisting
    ? await relabelSenderMail(admin, mailboxId, rule, 'block', ctx.user.id)
    : 0;
  await syncContactBlockFlags(admin, wsId, rule);
  return { status: 'created' as const, block: toBlock(data), moved };
}

export async function removeSenderBlock({
  ctx,
  mailboxId,
  blockId,
  restoreToInbox,
}: {
  ctx: MailRouteContext;
  mailboxId: string;
  blockId: string;
  restoreToInbox: boolean;
}) {
  const access = await requireMailboxAccess(ctx, mailboxId, ['owner', 'admin']);
  if (!access) return { status: 'forbidden' as const };
  const { admin } = access;
  const { data, error } = await privateTable(admin, 'mail_sender_blocks')
    .delete()
    .eq('id', blockId)
    .eq('mailbox_id', mailboxId)
    .select('kind, value')
    .maybeSingle();
  if (error) throw new Error('Failed to remove sender block');
  if (!data) return { status: 'not_found' as const };
  const rule = data as SenderBlockRule;
  const moved = restoreToInbox
    ? await relabelSenderMail(admin, mailboxId, rule, 'unblock')
    : 0;
  await syncContactBlockFlags(
    admin,
    await mailboxWorkspace(admin, mailboxId),
    rule
  );
  return { status: 'removed' as const, moved };
}

export { senderDomain };
