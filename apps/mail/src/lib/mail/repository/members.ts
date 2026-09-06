import type { UpsertMailMailboxMemberPayload } from '@tuturuuu/internal-api';
import type { MailMailboxMember, MailRouteContext } from '../types';
import { requireMailboxAccess } from './bootstrap';
import { type AnyRecord, privateTable } from './shared';

async function getMailboxMemberProfile(
  admin: AnyRecord,
  userId: string
): Promise<{ email: string | null; fullName: string | null }> {
  const [
    { data: user, error: userError },
    { data: privateDetails, error: privateDetailsError },
  ] = await Promise.all([
    admin.from('users').select('display_name').eq('id', userId).maybeSingle(),
    admin
      .from('user_private_details')
      .select('email, full_name')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  if (userError) {
    throw new Error(
      `Failed to load mailbox member profile: ${userError.message}`
    );
  }

  if (privateDetailsError) {
    throw new Error(
      `Failed to load mailbox member private profile: ${privateDetailsError.message}`
    );
  }

  return {
    email: privateDetails?.email ?? null,
    fullName: privateDetails?.full_name ?? user?.display_name ?? null,
  };
}

export async function listMailboxMembers({
  ctx,
  mailboxId,
}: {
  ctx: MailRouteContext;
  mailboxId: string;
}) {
  const access = await requireMailboxAccess(ctx, mailboxId);
  if (
    !access ||
    (!access.mailbox.groupPolicy && !['admin', 'owner'].includes(access.role))
  )
    return null;

  const { data: rows, error } = await privateTable(
    access.admin,
    'mail_mailbox_members'
  )
    .select('created_at, role, user_id')
    .eq('mailbox_id', mailboxId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to list mailbox members: ${error.message}`);
  }

  return Promise.all(
    (rows ?? []).map(async (row: AnyRecord): Promise<MailMailboxMember> => {
      const profile = await getMailboxMemberProfile(access.admin, row.user_id);

      return {
        createdAt: row.created_at,
        email: profile.email,
        fullName: profile.fullName,
        role: row.role,
        userId: row.user_id,
      };
    })
  );
}

export async function upsertMailboxMember({
  ctx,
  mailboxId,
  payload,
}: {
  ctx: MailRouteContext;
  mailboxId: string;
  payload: UpsertMailMailboxMemberPayload;
}) {
  const access = await requireMailboxAccess(ctx, mailboxId, ['admin', 'owner']);
  if (!access) return null;
  // Owners are protected from removal/demotion through routine member management.
  // This also prevents managers from elevating themselves to owner.
  if (payload.role === 'owner') return null;
  let userId = payload.userId;
  if (payload.email) {
    const { data: target, error } = await privateTable(
      access.admin,
      'mail_mailboxes'
    )
      .select('created_by')
      .eq('address', payload.email.trim().toLowerCase())
      .eq('type', 'personal')
      .eq('status', 'active')
      .eq('domain_id', access.mailbox.domainId)
      .maybeSingle();
    if (error) throw error;
    userId = target?.created_by;
  }
  if (!userId) return null;
  if (access.mailbox.groupPolicy) {
    const { data: target, error } = await privateTable(
      access.admin,
      'mail_mailboxes'
    )
      .select('id')
      .eq('created_by', userId)
      .eq('type', 'personal')
      .eq('status', 'active')
      .eq('domain_id', access.mailbox.domainId)
      .maybeSingle();
    if (error) throw error;
    if (!target) return null;
  }
  const { data: existing, error: existingError } = await privateTable(
    access.admin,
    'mail_mailbox_members'
  )
    .select('role')
    .eq('mailbox_id', mailboxId)
    .eq('user_id', userId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.role === 'owner') return null;

  const table = privateTable(access.admin, 'mail_mailbox_members');
  const values = {
    created_by: ctx.user.id,
    mailbox_id: mailboxId,
    role: payload.role,
    user_id: userId,
  };
  const { data, error } = await (existing
    ? table
        .update({ role: payload.role })
        .eq('mailbox_id', mailboxId)
        .eq('user_id', userId)
        .neq('role', 'owner')
    : table.insert(values)
  )
    .select('created_at, role, user_id')
    .maybeSingle();
  if (!data && !error) return null;

  if (error) {
    throw new Error(`Failed to upsert mailbox member: ${error.message}`);
  }

  const profile = await getMailboxMemberProfile(access.admin, data.user_id);

  return {
    createdAt: data.created_at,
    email: profile.email,
    fullName: profile.fullName,
    role: data.role,
    userId: data.user_id,
  } satisfies MailMailboxMember;
}

export async function removeMailboxMember({
  ctx,
  mailboxId,
  userId,
}: {
  ctx: MailRouteContext;
  mailboxId: string;
  userId: string;
}) {
  const access = await requireMailboxAccess(ctx, mailboxId, ['admin', 'owner']);
  if (!access) return false;

  const { data, error } = await privateTable(
    access.admin,
    'mail_mailbox_members'
  )
    .delete()
    .eq('mailbox_id', mailboxId)
    .eq('user_id', userId)
    .neq('role', 'owner')
    .select('user_id');

  if (error) {
    throw new Error(`Failed to remove mailbox member: ${error.message}`);
  }

  return Boolean(data?.length);
}
