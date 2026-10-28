import { canSendAsGroup, readGroupPolicy } from '../groups/policy';
import type {
  MailBootstrapResponse,
  MailMailbox,
  MailMailboxRole,
  MailRouteContext,
} from '../types';
import { hasSystemLabels, resolvePersonalMailbox } from './bootstrap-personal';
import { queryMailMessageRows } from './search';
import {
  type AnyRecord,
  ensureSystemLabels,
  getAdminClient,
  getCanonicalUserDisplayName,
  getCanonicalUserDisplayNames,
  normalizeAddress,
  privateTable,
  toLabel,
  toMailbox,
} from './shared';

type MailboxAccess = {
  admin: Awaited<ReturnType<typeof getAdminClient>>;
  metadata: AnyRecord['metadata'];
  mailbox: MailMailbox;
  role: MailMailboxRole;
};

type MailMessageRowsQuery = typeof queryMailMessageRows;

export async function getUnreadInboxCounts(
  admin: AnyRecord,
  mailboxIds: string[],
  userId: string,
  queryRows: MailMessageRowsQuery = queryMailMessageRows
) {
  const totals = await Promise.all(
    mailboxIds.map(async (mailboxId) => ({
      mailboxId,
      total: (
        await queryRows({
          admin,
          mailboxId,
          params: {
            folder: 'inbox',
            page: 1,
            pageSize: 1,
            query: 'is:unread',
          },
          userId,
        })
      ).total,
    }))
  );

  return new Map(totals.map(({ mailboxId, total }) => [mailboxId, total]));
}

export async function getMailBootstrap(
  ctx: MailRouteContext,
  includeUnreadCounts = true
): Promise<MailBootstrapResponse> {
  const admin = await getAdminClient();
  const { displayName, mailbox, memberRows } = await resolvePersonalMailbox(
    admin,
    ctx
  );
  const mailboxIds = memberRows.map((row) => row.mailbox_id);
  const [{ data: mailboxRows, error: mailboxError }, labelRows] =
    await Promise.all([
      privateTable(admin, 'mail_mailboxes')
        .select(
          '*, mail_domain:mail_domains!mail_mailboxes_domain_id_fkey(outbound_provider)'
        )
        .in('id', mailboxIds)
        .neq('status', 'archived')
        .order('type', { ascending: true })
        .order('address', { ascending: true }),
      loadLabelRows(admin, mailboxIds),
    ]);

  if (mailboxError) {
    throw new Error(`Failed to load mailboxes: ${mailboxError.message}`);
  }

  const rows = (mailboxRows ?? []) as AnyRecord[];
  const roleByMailboxId = new Map<string, MailMailboxRole>(
    memberRows.map((row) => [row.mailbox_id, row.role as MailMailboxRole])
  );
  const otherOwners = rows
    .filter((row) => row.type === 'personal' && row.created_by !== ctx.user.id)
    .map((row) => row.created_by);
  const [unreadByMailbox, personalDisplayNames, labels] = await Promise.all([
    includeUnreadCounts
      ? getUnreadInboxCounts(
          admin,
          rows.map((row) => row.id),
          ctx.user.id
        )
      : Promise.resolve(new Map<string, number | null>()),
    getCanonicalUserDisplayNames(admin, otherOwners).then((names) => {
      if (displayName) names.set(ctx.user.id, displayName);
      return names;
    }),
    // Self-heal system labels only when they are missing or renamed.
    hasSystemLabels(labelRows, mailbox.id)
      ? labelRows
      : ensureSystemLabels(admin, mailbox.id).then(() =>
          loadLabelRows(admin, mailboxIds)
        ),
  ]);
  const activeIds = new Set(rows.map((row) => row.id as string));
  const mailboxes: MailMailbox[] = rows.map((row) => ({
    ...toMailbox(
      row,
      roleByMailboxId.get(row.id) ?? 'viewer',
      personalDisplayNames.get(row.created_by)
    ),
    unreadCount: unreadByMailbox.get(row.id) ?? null,
  }));
  return {
    labels: labels.filter((row) => activeIds.has(row.mailbox_id)).map(toLabel),
    mailboxes,
    user: { email: ctx.user.email ?? '', id: ctx.user.id },
  };
}

async function loadLabelRows(admin: AnyRecord, mailboxIds: string[]) {
  if (mailboxIds.length === 0) return [];

  const { data, error } = await privateTable(admin, 'mail_labels')
    .select('*')
    .in('mailbox_id', mailboxIds)
    .order('kind', { ascending: false })
    .order('name', { ascending: true });

  if (error) {
    throw new Error(`Failed to load mail labels: ${error.message}`);
  }

  return (data ?? []) as AnyRecord[];
}

export async function requireMailboxAccess(
  ctx: MailRouteContext,
  mailboxId: string,
  roles?: readonly MailMailboxRole[]
): Promise<MailboxAccess | null> {
  const admin = await getAdminClient();
  // Both reads are keyed by the requested ID; nothing is returned unless the
  // membership check below passes.
  const [
    { data: member, error: memberError },
    { data: mailbox, error: mailboxError },
  ] = await Promise.all([
    privateTable(admin, 'mail_mailbox_members')
      .select('role')
      .eq('mailbox_id', mailboxId)
      .eq('user_id', ctx.user.id)
      .maybeSingle(),
    privateTable(admin, 'mail_mailboxes')
      .select(
        '*, mail_domain:mail_domains!mail_mailboxes_domain_id_fkey(outbound_provider)'
      )
      .eq('id', mailboxId)
      .maybeSingle(),
  ]);

  if (memberError) {
    throw new Error(
      `Failed to check mailbox membership: ${memberError.message}`
    );
  }

  if (!member?.role) {
    return null;
  }

  if (mailboxError) {
    throw new Error(`Failed to load mailbox: ${mailboxError.message}`);
  }

  const groupPolicy = readGroupPolicy(mailbox?.metadata);
  if (groupPolicy) {
    const { data: personal, error } = await privateTable(
      admin,
      'mail_mailboxes'
    )
      .select('status')
      .eq('created_by', ctx.user.id)
      .eq('address', normalizeAddress(ctx.user.email ?? ''))
      .eq('type', 'personal')
      .eq('domain_id', mailbox.domain_id)
      .maybeSingle();
    if (error) throw error;
    if (personal?.status !== 'active') return null;
  }
  if (
    roles &&
    !(groupPolicy && roles.includes('sender')
      ? canSendAsGroup(groupPolicy, member.role)
      : roles.includes(member.role))
  )
    return null;

  if (mailbox?.status !== 'active') {
    return null;
  }

  const [, personalDisplayName] = await Promise.all([
    ensureSystemLabels(admin, mailboxId),
    mailbox.type === 'personal'
      ? getCanonicalUserDisplayName(admin, mailbox.created_by)
      : Promise.resolve(null),
  ]);

  return {
    admin,
    metadata: mailbox.metadata ?? {},
    mailbox: toMailbox(mailbox, member.role, personalDisplayName),
    role: member.role as MailMailboxRole,
  };
}

// Counts are optional navigation metadata, fetched after mailbox discovery.
// Resolve membership again on the server; never trust client-supplied mailbox IDs.
export async function getMailUnreadCounts(ctx: MailRouteContext) {
  const admin = await getAdminClient();
  const { data, error } = await privateTable(admin, 'mail_mailbox_members')
    .select(
      'mailbox_id, mailbox:mail_mailboxes!mail_mailbox_members_mailbox_id_fkey!inner(status)'
    )
    .eq('user_id', ctx.user.id)
    .neq('mailbox.status', 'archived');
  if (error)
    throw new Error(`Failed to load mail memberships: ${error.message}`);
  return Object.fromEntries(
    await getUnreadInboxCounts(
      admin,
      (data ?? []).map((row: AnyRecord) => row.mailbox_id),
      ctx.user.id
    )
  );
}
