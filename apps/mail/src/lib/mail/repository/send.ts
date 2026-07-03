import { sendWorkspaceEmail } from '@tuturuuu/email-service';
import type { SendMailMessagePayload } from '@tuturuuu/internal-api';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import type { MailRouteContext } from '../types';
import { requireMailboxAccess } from './bootstrap';
import { createMailDraft, updateMailDraft } from './drafts';
import { getMailMessage } from './messages';
import { privateTable } from './shared';

export async function sendMailMessage({
  ctx,
  mailboxId,
  payload,
}: {
  ctx: MailRouteContext;
  mailboxId: string;
  payload: SendMailMessagePayload;
}) {
  const access = await requireMailboxAccess(ctx, mailboxId, [
    'admin',
    'owner',
    'sender',
  ]);
  if (!access) return null;

  const message =
    payload.draftId != null
      ? await updateMailDraft({
          ctx,
          draftId: payload.draftId,
          mailboxId,
          payload,
        })
      : await createMailDraft({ ctx, mailboxId, payload });

  if (!message) return null;

  const { error: queueError } = await privateTable(
    access.admin,
    'mail_messages'
  )
    .update({ status: 'sending' })
    .eq('id', message.id);

  if (queueError) {
    throw new Error(`Failed to queue message: ${queueError.message}`);
  }

  const { data: outboundJob, error: jobError } = await privateTable(
    access.admin,
    'mail_outbound_jobs'
  )
    .insert({
      mailbox_id: mailboxId,
      message_id: message.id,
      recipients: {
        bcc: payload.bcc ?? [],
        cc: payload.cc ?? [],
        to: payload.to,
      },
      status: 'sending',
    })
    .select('*')
    .single();

  if (jobError) {
    throw new Error(`Failed to create outbound job: ${jobError.message}`);
  }

  const result = await sendWorkspaceEmail(
    ctx.normalizedWsId || ROOT_WORKSPACE_ID,
    {
      content: {
        headers: {
          ...(payload.inReplyTo ? { 'In-Reply-To': payload.inReplyTo } : {}),
          ...(payload.references?.length
            ? { References: payload.references.join(' ') }
            : {}),
        },
        html: message.sanitizedHtml || message.bodyHtml || '',
        subject: message.subject,
        text: message.bodyText ?? undefined,
      },
      metadata: {
        entityId: message.id,
        entityType: 'mail_message',
        templateType: 'mail',
        userId: ctx.user.id,
      },
      recipients: {
        bcc: payload.bcc,
        cc: payload.cc,
        to: payload.to,
      },
      source: {
        email: access.mailbox.address,
        name: access.mailbox.displayName || access.mailbox.address,
      },
    }
  );

  const nextStatus = result.success ? 'sent' : 'failed';
  const now = new Date().toISOString();

  await Promise.all([
    privateTable(access.admin, 'mail_messages')
      .update({
        provider_message_id: result.messageId ?? null,
        sent_at: result.success ? now : null,
        status: nextStatus,
      })
      .eq('id', message.id),
    privateTable(access.admin, 'mail_outbound_jobs')
      .update({
        error_message: result.error ?? null,
        provider_message_id: result.messageId ?? null,
        sent_at: result.success ? now : null,
        status: nextStatus,
      })
      .eq('id', outboundJob.id),
  ]);

  if (!result.success) {
    serverLogger.warn('[mail] outbound send failed', {
      error: result.error,
      mailboxId,
      messageId: message.id,
      wsId: ctx.normalizedWsId,
    });
  }

  return getMailMessage({ ctx, mailboxId, messageId: message.id });
}
