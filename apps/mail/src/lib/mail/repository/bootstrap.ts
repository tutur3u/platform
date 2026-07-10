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
  getUserDisplayName,
  normalizeAddress,
  privateTable,
  toLabel,
  toMailbox,
} from './shared';

async function ensurePersonalMailbox(ctx: MailRouteContext) {
  const admin = await getAdminClient();
  const email = normalizeAddress(ctx.user.email ?? '');

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
        display_name: getUserDisplayName(ctx.user),
        domain_id: mailDomain.id,
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
    .select('*')
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
  const mailboxes: MailMailbox[] = (mailboxRows ?? []).map((row: AnyRecord) =>
    toMailbox(row, roleByMailboxId.get(row.id) ?? 'viewer')
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
    .select('*')
    .eq('id', mailboxId)
    .maybeSingle();

  if (mailboxError) {
    throw new Error(`Failed to load mailbox: ${mailboxError.message}`);
  }

  if (mailbox?.status !== 'active') {
    return null;
  }

  await ensureSystemLabels(admin, mailboxId);

  return {
    admin,
    mailbox: toMailbox(mailbox, member.role),
    role: member.role as MailMailboxRole,
  };
}
