import { resolveInternalMailboxName } from '../identity';
import type {
  MailBootstrapResponse,
  MailMailbox,
  MailMailboxRole,
  MailRouteContext,
} from '../types';
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
  ctx: MailRouteContext
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
  const { data: threadRows, error: threadError } = await privateTable(
    admin,
    'mail_threads'
  )
    .select('mailbox_id,unread_count')
    .in('mailbox_id', mailboxIds);
  if (threadError) {
    throw new Error(
      `Failed to load mailbox unread counts: ${threadError.message}`
    );
  }
  const unreadByMailbox = new Map<string, number>();
  for (const thread of threadRows ?? []) {
    unreadByMailbox.set(
      thread.mailbox_id,
      (unreadByMailbox.get(thread.mailbox_id) ?? 0) +
        Number(thread.unread_count ?? 0)
    );
  }
  const personalDisplayNames = await getCanonicalUserDisplayNames(
    admin,
    (mailboxRows ?? [])
      .filter((row: AnyRecord) => row.type === 'personal')
      .map((row: AnyRecord) => row.created_by)
  );
  const mailboxes: MailMailbox[] = (mailboxRows ?? []).map(
    (row: AnyRecord) => ({
      ...toMailbox(
        row,
        roleByMailboxId.get(row.id) ?? 'viewer',
        personalDisplayNames.get(row.created_by)
      ),
      unreadCount: unreadByMailbox.get(row.id) ?? 0,
    })
  );
  const labels = await listLabels(
    admin,
    mailboxes.map((mailbox) => mailbox.id)
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

  if (!member?.role || (roles && !roles.includes(member.role))) {
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

  if (mailbox?.status !== 'active') {
    return null;
  }

  await ensureSystemLabels(admin, mailboxId);
  const personalDisplayName =
    mailbox.type === 'personal'
      ? await getCanonicalUserDisplayName(admin, mailbox.created_by)
      : null;

  return {
    admin,
    mailbox: toMailbox(mailbox, member.role, personalDisplayName),
    role: member.role as MailMailboxRole,
  };
}
