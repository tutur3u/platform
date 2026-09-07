import { readGroupPolicy } from '../groups/policy';
import { type AnyRecord, privateTable } from '../repository/shared';
import { readMailAutomation } from './policy';

/** Resolve on every delivery so a catch-all change never leaves a stale target. */
export async function resolveForwardingMailbox(
  admin: AnyRecord,
  mailbox: AnyRecord
) {
  const { forwarding } = readMailAutomation(mailbox.metadata);
  if (forwarding.mode === 'off' || readGroupPolicy(mailbox.metadata))
    return null;
  let query = privateTable(admin, 'mail_mailboxes')
    .select('*')
    .eq('domain_id', mailbox.domain_id)
    .eq('status', 'active');
  if (forwarding.mode === 'catch_all') {
    const { data: domain, error } = await privateTable(admin, 'mail_domains')
      .select('catch_all_enabled,catch_all_mailbox_id')
      .eq('id', mailbox.domain_id)
      .single();
    if (error) throw error;
    if (!domain.catch_all_enabled || !domain.catch_all_mailbox_id) return null;
    query = query.eq('id', domain.catch_all_mailbox_id);
  } else {
    query = query.eq('address', forwarding.address);
  }
  const { data: target, error } = await query.maybeSingle();
  if (error) throw error;
  if (!target || target.id === mailbox.id || readGroupPolicy(target.metadata))
    return null;
  return target;
}
