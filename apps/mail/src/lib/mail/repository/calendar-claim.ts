import type { CalendarResponse } from '../calendar-invitation';
import type { MailRouteContext } from '../types';
import { requireMailboxAccess } from './bootstrap';
import { getMailMessage } from './messages';
import { mailMessageTable } from './shared';

/** Serialize invitation replies across tabs/devices, in addition to draft send claims. */
export async function claimCalendarReply(
  ctx: MailRouteContext,
  mailboxId: string,
  messageId: string,
  id: string,
  response: CalendarResponse,
  requestId: string
) {
  const access = await requireMailboxAccess(ctx, mailboxId, [
    'owner',
    'admin',
    'sender',
  ]);
  if (!access || access.mailbox.groupPolicy) return { status: 'unavailable' };
  const { data: source, error } = await mailMessageTable(access, ctx)
    .select('metadata')
    .eq('id', messageId)
    .eq('mailbox_id', mailboxId)
    .maybeSingle();
  if (error) throw new Error('Failed to load invitation claim');
  if (!source) return { status: 'unavailable' };
  const current = source.metadata?.calendar_reply_claim;
  if (current?.id === id) return { status: 'claimed' };
  if (current?.id) {
    const existing = await getMailMessage({
      ctx,
      mailboxId,
      messageId: current.id,
    });
    if (!existing || ['draft', 'queued', 'sending'].includes(existing.status))
      return { status: 'sending' };
    if (current.response === response) return { status: existing.status };
  }
  const metadata = {
    ...(source.metadata ?? {}),
    calendar_reply_claim: {
      id,
      response,
      request_id: requestId,
      actor_id: ctx.user.id,
    },
  };
  let claim = mailMessageTable(access, ctx)
    .update({ metadata })
    .eq('id', messageId)
    .eq('mailbox_id', mailboxId);
  claim =
    source.metadata === null
      ? claim.is('metadata', null)
      : claim.eq('metadata', JSON.stringify(source.metadata));
  const { data: won, error: claimError } = await claim
    .select('id')
    .maybeSingle();
  if (claimError) throw new Error('Failed to claim invitation response');
  return { status: won ? 'claimed' : 'sending' };
}
