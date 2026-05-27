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
  const access = await requireMailboxAccess(ctx, mailboxId, ['admin', 'owner']);
  if (!access) return null;

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

  const { data, error } = await privateTable(
    access.admin,
    'mail_mailbox_members'
  )
    .upsert(
      {
        created_by: ctx.user.id,
        mailbox_id: mailboxId,
        role: payload.role,
        user_id: payload.userId,
      },
      { onConflict: 'mailbox_id,user_id' }
    )
    .select('created_at, role, user_id')
    .single();

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

  const { error } = await privateTable(access.admin, 'mail_mailbox_members')
    .delete()
    .eq('mailbox_id', mailboxId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to remove mailbox member: ${error.message}`);
  }

  return true;
}
