import { getVerifiedAuthEmail } from '@tuturuuu/supabase/next/user';
import { resolveInternalMailboxName } from '../identity';
import { linkPersonalMailboxWorkspace } from '../repository/shared';
import { normalizeAddress } from './parser';
import type { AnyRecord } from './types';

function privateTable(client: AnyRecord, table: string) {
  return client.schema('private').from(table);
}

/**
 * A provisioning failure that carries only the step and the error code. Error
 * messages and details from the database can repeat the recipient address,
 * and the inbound webhooks log what this throws.
 */
function provisionError(step: string, error: { code?: unknown }) {
  const code = typeof error.code === 'string' ? error.code : 'unknown';
  return new Error(`Mailbox provisioning failed at ${step} (${code})`);
}

const UNIQUE_VIOLATION = '23505';

async function findMailboxByAddress(admin: AnyRecord, address: string) {
  const { data, error } = await privateTable(admin, 'mail_mailboxes')
    .select('*')
    .eq('address', address)
    .maybeSingle();
  if (error) throw provisionError('mailbox lookup', error);
  return data as AnyRecord | null;
}

/**
 * The internal user whose confirmed account email is `address`. The stored
 * profile email only nominates a candidate; the confirmed Auth email decides.
 */
async function findConfirmedRecipientUser(admin: AnyRecord, address: string) {
  const { data, error } = await admin
    .from('user_private_details')
    .select('user_id')
    .eq('email', address)
    .limit(2);
  if (error) throw provisionError('profile lookup', error);
  if (!data || data.length !== 1) return null;
  const userId = data[0].user_id as string;
  const confirmed = await getVerifiedAuthEmail(
    admin as Parameters<typeof getVerifiedAuthEmail>[0],
    userId
  );
  return confirmed && normalizeAddress(confirmed) === address ? userId : null;
}

/**
 * The active personal mailbox for an internal recipient, created on first
 * delivery when the address is a user's confirmed account email.
 *
 * An existing non-active mailbox (retained for a former employee, quarantined
 * or archived) is never reactivated here, so delivery falls back to catch-all
 * until an admin adopts or restores it. The fallback is logged with the
 * mailbox id and status only.
 */
export async function ensureMailboxForRecipient(
  admin: AnyRecord,
  address: string,
  domainId: string
) {
  const normalizedAddress = normalizeAddress(address);
  const existing = await findMailboxByAddress(admin, normalizedAddress);
  if (existing) {
    if (existing.status === 'active') return existing;
    console.warn('[mail] inbound recipient mailbox is not active', {
      mailboxId: existing.id,
      status: existing.status,
    });
    return null;
  }

  const userId = await findConfirmedRecipientUser(admin, normalizedAddress);
  if (!userId) return null;

  const { data: user, error: userError } = await admin
    .from('users')
    .select('display_name')
    .eq('id', userId)
    .maybeSingle();
  if (userError) throw provisionError('user lookup', userError);

  const senderName = resolveInternalMailboxName(
    user?.display_name,
    normalizedAddress
  );
  const { data: mailbox, error } = await privateTable(admin, 'mail_mailboxes')
    .insert({
      address: normalizedAddress,
      created_by: userId,
      display_name: senderName,
      domain_id: domainId,
      sender_name: senderName,
      type: 'personal',
    })
    .select('*')
    .single();

  if (error) {
    // A concurrent first delivery created the mailbox; use the one it wrote.
    // Any other unique violation (an address reservation, for example) leaves
    // no mailbox to read and stays a failure, never a catch-all delivery.
    if (error.code === UNIQUE_VIOLATION) {
      const winner = await findMailboxByAddress(admin, normalizedAddress);
      if (winner) return winner.status === 'active' ? winner : null;
    }
    throw provisionError('insert', error);
  }

  await privateTable(admin, 'mail_mailbox_members').upsert(
    {
      created_by: userId,
      mailbox_id: mailbox.id,
      role: 'owner',
      user_id: userId,
    },
    { onConflict: 'mailbox_id,user_id' }
  );
  await linkPersonalMailboxWorkspace(admin, mailbox.id);

  return mailbox;
}
