import { createHash } from 'node:crypto';
import {
  type CalendarResponse,
  calendarReply,
  parseCalendarInvitation,
} from '../calendar-invitation';
import { readMailStoredObject } from '../storage';
import type { MailRouteContext } from '../types';
import { getAuthorizedAttachment, uploadDraftAttachment } from './attachments';
import { requireMailboxAccess } from './bootstrap';
import { claimCalendarReply } from './calendar-claim';
import { readLegacyCalendarSource } from './calendar-source';
import { coalesceCalendarSources } from './calendar-sources';
import { createMailDraft } from './drafts';
import { getMailMessage } from './messages';
import { sendMailMessage } from './send';
import { mailMessageTable } from './shared';

export async function getMailInvitation(
  ctx: MailRouteContext,
  mailboxId: string,
  messageId: string
) {
  const access = await requireMailboxAccess(ctx, mailboxId, [
    'owner',
    'admin',
    'sender',
  ]);
  // Group delivery copies are not an individual calendar identity.
  if (!access || access.mailbox.groupPolicy) return null;
  const message = await getMailMessage({ ctx, mailboxId, messageId });
  if (message?.direction !== 'inbound') return null;
  let claimMetadata:
    | { id: string; response: string; actor_id: string; request_id: string }
    | undefined;
  if (message.threadId) {
    const { data: latest, error } = await mailMessageTable(access, ctx)
      .select('id,metadata')
      .eq('mailbox_id', mailboxId)
      .eq('thread_id', message.threadId)
      .eq('direction', 'inbound')
      .order('received_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error('Failed to check latest invitation');
    // Never answer a superseded request after an update or cancellation arrived.
    // Conservative for legacy threads without indexed iCalendar identity.
    if (!latest || latest.id !== messageId) return null;
    claimMetadata = latest.metadata?.calendar_reply_claim;
  } else {
    const { data, error } = await mailMessageTable(access, ctx)
      .select('metadata')
      .eq('id', messageId)
      .eq('mailbox_id', mailboxId)
      .maybeSingle();
    if (error) throw new Error('Failed to load invitation claim');
    claimMetadata = data?.metadata?.calendar_reply_claim;
  }
  const candidates = message.attachments.filter(
    (file) =>
      file.contentType.split(';')[0]?.trim().toLowerCase() ===
        'text/calendar' || /\.ics$/iu.test(file.filename)
  );
  // Google can include the same request as an alternative body and an ICS file.
  // Authorize every copy; never select one of conflicting or oversized sources.
  if (
    candidates.length > 8 ||
    candidates.some(
      (file) => file.sizeBytes <= 0 || file.sizeBytes > 256 * 1024
    ) ||
    candidates.reduce((sum, file) => sum + file.sizeBytes, 0) > 512 * 1024
  )
    return null;
  const sources: Uint8Array[] = [];
  for (const candidate of candidates) {
    const attachment = await getAuthorizedAttachment({
      ctx,
      mailboxId,
      messageId,
      attachmentId: candidate.id,
    });
    if (!attachment) return null;
    const bytes = await readMailStoredObject(attachment.location);
    sources.push(bytes);
    if (
      bytes.byteLength > 256 * 1024 ||
      sources.reduce((sum, source) => sum + source.byteLength, 0) > 512 * 1024
    )
      return null;
  }
  const source = sources.length
    ? coalesceCalendarSources(sources)
    : await readLegacyCalendarSource(ctx, mailboxId, messageId);
  const invitation =
    source && parseCalendarInvitation(source, access.mailbox.address);
  if (!invitation) return null;
  if (
    claimMetadata?.id &&
    ['ACCEPTED', 'DECLINED', 'TENTATIVE'].includes(claimMetadata.response)
  ) {
    const { data, error } = await mailMessageTable(access, ctx)
      .select('status')
      .eq('id', claimMetadata.id)
      .eq('mailbox_id', mailboxId)
      .maybeSingle();
    if (error) throw new Error('Failed to load invitation response');
    const own = claimMetadata.actor_id === ctx.user.id;
    const status =
      !data || data.status === 'draft'
        ? own
          ? 'preparing'
          : 'sending'
        : data.status;
    return {
      invitation,
      message,
      retryReplyId: own ? (claimMetadata.id as string) : undefined,
      reply: {
        response: claimMetadata.response as CalendarResponse,
        status: status as string,
        ...(own ? { retryRequestId: claimMetadata.request_id as string } : {}),
      },
    };
  }
  const { data: previous, error } = await mailMessageTable(access, ctx)
    .select('metadata,status')
    .eq('mailbox_id', mailboxId)
    .eq('metadata->calendar_reply->>source_message_id', messageId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error('Failed to load invitation response');
  const response = previous?.metadata?.calendar_reply?.response;
  const reply = ['ACCEPTED', 'DECLINED', 'TENTATIVE'].includes(response)
    ? {
        response: response as CalendarResponse,
        status: previous.status as string,
      }
    : null;
  return { invitation, message, reply, retryReplyId: undefined };
}

function replyId(parts: string[]) {
  const hash = createHash('sha256').update(JSON.stringify(parts)).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export async function respondToMailInvitation({
  ctx,
  mailboxId,
  messageId,
  response,
  requestId,
}: {
  ctx: MailRouteContext;
  mailboxId: string;
  messageId: string;
  response: CalendarResponse;
  requestId: string;
}) {
  // Derive every address and calendar property from authorized stored bytes.
  const source = await getMailInvitation(ctx, mailboxId, messageId);
  if (!source) return null;
  const id =
    source.retryReplyId &&
    source.reply?.retryRequestId === requestId &&
    source.reply.response === response
      ? source.retryReplyId
      : replyId([mailboxId, ctx.user.id, messageId, requestId, response]);
  const claim = await claimCalendarReply(
    ctx,
    mailboxId,
    messageId,
    id,
    response,
    requestId
  );
  if (claim.status === 'unavailable') return null;
  if (claim.status !== 'claimed') {
    // A completed replay acknowledges its old send without reverting current UI state.
    const latest = await getMailInvitation(ctx, mailboxId, messageId);
    if (!latest) return null;
    return {
      status: latest.reply?.status ?? claim.status,
      response: latest.reply?.response ?? response,
    };
  }
  const previous = await getMailMessage({ ctx, mailboxId, messageId: id });
  // An uncertain provider result is never retried automatically.
  if (previous && previous.status !== 'draft') {
    const latest = await getMailInvitation(ctx, mailboxId, messageId);
    if (!latest) return null;
    return {
      status: latest.reply?.status ?? previous.status,
      response: latest.reply?.response ?? response,
    };
  }
  const payload = {
    clientMessageId: id,
    to: [source.invitation.organizer],
    subject: `Re: ${source.message.subject}`,
    bodyText: `${response}: ${source.invitation.summary || source.message.subject}`,
    inReplyTo: source.message.internetMessageId ?? undefined,
    references: source.message.references,
  };
  const draft = await createMailDraft({ ctx, mailboxId, payload });
  if (!draft) return null;
  if (draft.status !== 'draft') return { status: draft.status };
  const access = await requireMailboxAccess(ctx, mailboxId, [
    'owner',
    'admin',
    'sender',
  ]);
  if (!access) return null;
  const { error: metadataError } = await mailMessageTable(access, ctx)
    .update({
      metadata: {
        calendar_reply: {
          source_message_id: messageId,
          uid: source.invitation.uid,
          sequence: source.invitation.sequence,
          recurrence: source.invitation.recurrence,
          attendee: source.invitation.attendee,
          response,
        },
      },
    })
    .eq('id', draft.id)
    .eq('status', 'draft')
    .eq('created_by', ctx.user.id);
  if (metadataError) throw new Error('Failed to record invitation response');
  const file = await uploadDraftAttachment({
    ctx,
    mailboxId,
    draftId: draft.id,
    clientAttachmentId: replyId([id, 'calendar-reply']),
    bytes: new TextEncoder().encode(calendarReply(source.invitation, response)),
    contentType: 'text/calendar; charset=UTF-8; method=REPLY',
    disposition: 'attachment',
    filename: 'reply.ics',
  });
  if (!file) return null;
  const sent = await sendMailMessage({
    ctx,
    mailboxId,
    payload: { ...payload, draftId: draft.id },
  });
  return sent ? { status: sent.status } : null;
}
