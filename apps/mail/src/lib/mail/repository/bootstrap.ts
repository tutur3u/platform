import { canSendAsGroup, readGroupPolicy } from '../groups/policy';
import { resolveInternalMailboxName } from '../identity';
import type {
  MailBootstrapResponse,
  MailMailbox,
  MailMailboxRole,
  MailRouteContext,
} from '../types';
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

async function ensurePersonalMailbox(ctx: MailRouteContext) {
  const admin = await getAdminClient();
  const email = normalizeAddress(ctx.user.email ?? '');
  const canonicalName = resolveInternalMailboxName(
    await getCanonicalUserDisplayName(admin, ctx.user.id),
    email
  );

  const { data: existing, error: existingError } = await privateTable(
    admin,
    'mail_mailboxes'
  )
    .select('*')
    .eq('address', email)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to load mail mailbox: ${existingError.message}`);
  }

  let mailbox = existing;

  if (
    mailbox?.type === 'personal' &&
    (mailbox.created_by !== ctx.user.id ||
      mailbox.display_name !== canonicalName ||
      mailbox.sender_name !== canonicalName)
  ) {
    const { data: synchronized, error } = await privateTable(
      admin,
      'mail_mailboxes'
    )
      .update({
        created_by: ctx.user.id,
        display_name: canonicalName,
        sender_name: canonicalName,
      })
      .eq('id', mailbox.id)
      .select('*')
      .single();

    if (error) {
      throw new Error(
        `Failed to synchronize mailbox identity: ${error.message}`
      );
    }
    mailbox = synchronized;
  }

  if (!mailbox) {
    const domain = email.split('@')[1];
    const { data: mailDomain, error: domainError } = await privateTable(
      admin,
      'mail_domains'
    )
      .select('id')
      .eq('domain', domain)
      .eq('status', 'active')
      .maybeSingle();

    if (domainError) {
      throw new Error(`Failed to load mail domain: ${domainError.message}`);
    }
    if (!mailDomain?.id) {
      throw new Error('No active mail domain is configured for this address');
    }

    const { data: created, error } = await privateTable(admin, 'mail_mailboxes')
      .insert({
        address: email,
        created_by: ctx.user.id,
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

    mailbox = created;
  }

  const { error: memberError } = await privateTable(
    admin,
    'mail_mailbox_members'
  ).upsert(
    {
      created_by: ctx.user.id,
      mailbox_id: mailbox.id,
      role: 'owner',
      user_id: ctx.user.id,
    },
    { onConflict: 'mailbox_id,user_id' }
  );

  if (memberError) {
    throw new Error(
      `Failed to create mail mailbox membership: ${memberError.message}`
    );
  }

  await ensureSystemLabels(admin, mailbox.id);

  return mailbox;
}

export async function getMailBootstrap(
  ctx: MailRouteContext,
  includeUnreadCounts = true
): Promise<MailBootstrapResponse> {
  const admin = await getAdminClient();
  await ensurePersonalMailbox(ctx);

  const { data: memberRows, error: memberError } = await privateTable(
    admin,
    'mail_mailbox_members'
  )
    .select('mailbox_id, role')
    .eq('user_id', ctx.user.id);

  if (memberError) {
    throw new Error(`Failed to load mail memberships: ${memberError.message}`);
  }

  const mailboxIds = (memberRows ?? []).map((row: AnyRecord) => row.mailbox_id);

  if (mailboxIds.length === 0) {
    return {
      labels: [],
      mailboxes: [],
      user: { email: ctx.user.email ?? '', id: ctx.user.id },
    };
  }

  const { data: mailboxRows, error: mailboxError } = await privateTable(
    admin,
    'mail_mailboxes'
  )
    .select(
      '*, mail_domain:mail_domains!mail_mailboxes_domain_id_fkey(outbound_provider)'
    )
    .in('id', mailboxIds)
    .neq('status', 'archived')
    .order('type', { ascending: true })
    .order('address', { ascending: true });

  if (mailboxError) {
    throw new Error(`Failed to load mailboxes: ${mailboxError.message}`);
  }

  const roleByMailboxId = new Map<string, MailMailboxRole>(
    (memberRows ?? []).map((row: AnyRecord) => [row.mailbox_id, row.role])
  );
  const [unreadByMailbox, personalDisplayNames, labels] = await Promise.all([
    includeUnreadCounts
      ? getUnreadInboxCounts(
          admin,
          (mailboxRows ?? []).map((row: AnyRecord) => row.id),
          ctx.user.id
        )
      : Promise.resolve(new Map<string, number | null>()),
    getCanonicalUserDisplayNames(
      admin,
      (mailboxRows ?? [])
        .filter((row: AnyRecord) => row.type === 'personal')
        .map((row: AnyRecord) => row.created_by)
    ),
    listLabels(
      admin,
      (mailboxRows ?? []).map((row: AnyRecord) => row.id)
    ),
  ]);
  const mailboxes: MailMailbox[] = (mailboxRows ?? []).map(
    (row: AnyRecord) => ({
      ...toMailbox(
        row,
        roleByMailboxId.get(row.id) ?? 'viewer',
        personalDisplayNames.get(row.created_by)
      ),
      unreadCount: unreadByMailbox.get(row.id) ?? null,
    })
  );
  return {
    labels,
    mailboxes,
    user: { email: ctx.user.email ?? '', id: ctx.user.id },
  };
}

async function listLabels(admin: AnyRecord, mailboxIds: string[]) {
  if (mailboxIds.length === 0) return [];

  const { data, error } = await privateTable(admin, 'mail_labels')
    .select('*')
    .in('mailbox_id', mailboxIds)
    .order('kind', { ascending: false })
    .order('name', { ascending: true });

  if (error) {
    throw new Error(`Failed to load mail labels: ${error.message}`);
  }

  return (data ?? []).map(toLabel);
}

export async function requireMailboxAccess(
  ctx: MailRouteContext,
  mailboxId: string,
  roles?: readonly MailMailboxRole[]
) {
  const admin = await getAdminClient();
  const { data: member, error: memberError } = await privateTable(
    admin,
    'mail_mailbox_members'
  )
    .select('role')
    .eq('mailbox_id', mailboxId)
    .eq('user_id', ctx.user.id)
    .maybeSingle();

  if (memberError) {
    throw new Error(
      `Failed to check mailbox membership: ${memberError.message}`
    );
  }

  if (!member?.role) {
    return null;
  }

  const { data: mailbox, error: mailboxError } = await privateTable(
    admin,
    'mail_mailboxes'
  )
    .select(
      '*, mail_domain:mail_domains!mail_mailboxes_domain_id_fkey(outbound_provider)'
    )
    .eq('id', mailboxId)
    .maybeSingle();

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
