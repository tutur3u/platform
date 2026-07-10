import { EmailService, sendWorkspaceEmail } from '@tuturuuu/email-service';
import type { SendMailMessagePayload } from '@tuturuuu/internal-api';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import type { MailRouteContext } from '../types';
import { loadOutboundAttachments } from './attachments';
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

  const { data: mailboxProvider, error: mailboxProviderError } =
    await privateTable(access.admin, 'mail_mailboxes')
      .select('domain_id, outbound_provider_override')
      .eq('id', mailboxId)
      .single();
  if (mailboxProviderError) {
    throw new Error(
      `Failed to load mailbox provider: ${mailboxProviderError.message}`
    );
  }
  const { data: domain, error: domainError } = await privateTable(
    access.admin,
    'mail_domains'
  )
    .select('cloudflare_account_id, outbound_provider, status')
    .eq('id', mailboxProvider.domain_id)
    .single();
  if (domainError) {
    throw new Error(`Failed to load mail domain: ${domainError.message}`);
  }
  if (domain.status !== 'active') {
    throw new Error('Mail domain is not active');
  }
  const outboundProvider =
    mailboxProvider.outbound_provider_override ?? domain.outbound_provider;

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
      provider: outboundProvider,
      status: 'sending',
    })
    .select('*')
    .single();

  if (jobError) {
    throw new Error(`Failed to create outbound job: ${jobError.message}`);
  }

  const attachments = await loadOutboundAttachments(
    access.admin,
    mailboxId,
    message.id
  );
  const replyHeaders = {
    ...(payload.inReplyTo ? { 'In-Reply-To': payload.inReplyTo } : {}),
    ...(payload.references?.length
      ? { References: payload.references.join(' ') }
      : {}),
  };
  const senderDomain = access.mailbox.address.split('@')[1] ?? 'tuturuuu.com';
  const sesInternetMessageId = `<${message.id}@${senderDomain}>`;
  if (outboundProvider === 'ses') {
    await privateTable(access.admin, 'mail_messages')
      .update({ internet_message_id: sesInternetMessageId })
      .eq('id', message.id)
      .eq('mailbox_id', mailboxId);
  }
  const sendParams = {
    content: {
      attachments,
      // Cloudflare controls Message-ID and rejects attempts to set it. SES raw
      // MIME accepts the deterministic ID, which lets inbound replies resolve
      // authoritatively without relying on normalized subjects.
      headers:
        outboundProvider === 'ses'
          ? { 'Message-ID': sesInternetMessageId, ...replyHeaders }
          : replyHeaders,
      html: message.sanitizedHtml || message.bodyHtml || '',
      subject: message.subject,
      text: message.bodyText ?? undefined,
    },
    metadata: {
      attachments: attachments.map((attachment) => ({
        contentType: attachment.contentType,
        fileName: attachment.filename,
        sizeBytes: attachment.data.byteLength,
      })),
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
  };
  const workspaceId = ctx.normalizedWsId || ROOT_WORKSPACE_ID;
  const result =
    outboundProvider === 'cloudflare'
      ? await (async () => {
          const apiToken = process.env.MAIL_CLOUDFLARE_API_TOKEN;
          const accountId =
            domain.cloudflare_account_id ??
            process.env.MAIL_CLOUDFLARE_ACCOUNT_ID;
          if (!apiToken || !accountId) {
            return {
              error: 'Cloudflare mail provider is not configured',
              success: false,
            };
          }
          return EmailService.create(
            {
              accountId,
              apiToken,
              type: 'cloudflare',
            },
            sendParams.source
          ).send({
            ...sendParams,
            metadata: { ...sendParams.metadata, wsId: workspaceId },
          });
        })()
      : await sendWorkspaceEmail(workspaceId, sendParams);

  const nextStatus = result.success ? 'sent' : 'failed';
  const now = new Date().toISOString();

  await Promise.all([
    privateTable(access.admin, 'mail_messages')
      .update({
        provider: outboundProvider,
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
    console.warn('[mail] outbound send failed', {
      error: result.error,
      mailboxId,
      messageId: message.id,
      wsId: ctx.normalizedWsId,
    });
  }

  return getMailMessage({ ctx, mailboxId, messageId: message.id });
}
