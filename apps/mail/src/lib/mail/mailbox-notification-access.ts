import 'server-only';

import { createAdminClient } from '@tuturuuu/supabase/next/server';

/** Discovery syntax is never configured-domain or mailbox authority. */
export function managedMailDomain(
  email: string | null | undefined
): string | null {
  if (!email || email !== email.trim()) return null;
  const normalized = email.toLowerCase();
  if (
    !/^[^@\s]+@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*tuturuuu\.com$/u.test(
      normalized
    )
  )
    return null;
  return normalized.split('@')[1] ?? null;
}

/** Mail-only access for a current, configured subdomain mailbox owner. */
export async function hasManagedMailMailbox(user: {
  id: string;
  email?: string | null;
}) {
  const domain = managedMailDomain(user.email);
  if (!domain || domain === 'tuturuuu.com') return false;
  const admin = await createAdminClient({ noCookie: true });
  const { data: identity, error: identityError } =
    await admin.auth.admin.getUserById(user.id);
  const stored = identity.user;
  if (identityError) throw identityError;
  if (
    stored?.id !== user.id ||
    !stored.email ||
    !stored.email_confirmed_at ||
    stored.email?.toLowerCase() !== user.email?.toLowerCase() ||
    (stored.banned_until && Date.parse(stored.banned_until) > Date.now())
  )
    return false;
  const { data: configured, error: domainError } = await admin
    .schema('private')
    .from('mail_domains')
    .select('id')
    .eq('domain', domain)
    .eq('status', 'active')
    .not('verified_at', 'is', null)
    .maybeSingle();
  if (domainError) throw domainError;
  if (!configured) return false;
  // Existing bootstrap may synchronize a personal mailbox. Require its owner
  // and address here so admitting a subdomain cannot take over another mailbox.
  const { data: mailbox, error: mailboxError } = await admin
    .schema('private')
    .from('mail_mailboxes')
    .select('id')
    .eq('domain_id', configured.id)
    .eq('address', stored.email.toLowerCase())
    .eq('created_by', user.id)
    .eq('type', 'personal')
    .eq('status', 'active')
    .maybeSingle();
  if (mailboxError) throw mailboxError;
  if (!mailbox) return false;
  const { data: member, error: memberError } = await admin
    .schema('private')
    .from('mail_mailbox_members')
    .select('user_id')
    .eq('mailbox_id', mailbox.id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (memberError) throw memberError;
  return member?.user_id === user.id;
}
