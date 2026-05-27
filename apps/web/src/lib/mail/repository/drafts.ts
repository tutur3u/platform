import type {
  CreateMailDraftPayload,
  UpdateMailDraftPayload,
} from '@tuturuuu/internal-api';
import { createSnippet, sanitizeMailHtml, textToHtml } from '../html';
import type { MailMailbox, MailRouteContext } from '../types';
import { requireMailboxAccess } from './bootstrap';
import { getMailMessage } from './messages';
import { type AnyRecord, normalizeAddress, privateTable } from './shared';

function getRecipientRows(messageId: string, payload: CreateMailDraftPayload) {
  return [
    ...payload.to.map((address) => ({
      address: normalizeAddress(address),
      kind: 'to',
      message_id: messageId,
    })),
    ...(payload.cc ?? []).map((address) => ({
      address: normalizeAddress(address),
      kind: 'cc',
      message_id: messageId,
    })),
    ...(payload.bcc ?? []).map((address) => ({
      address: normalizeAddress(address),
      kind: 'bcc',
      message_id: messageId,
    })),
  ];
}

async function replaceRecipients(
  admin: AnyRecord,
  messageId: string,
  payload: CreateMailDraftPayload
) {
  const { error: deleteError } = await privateTable(admin, 'mail_recipients')
    .delete()
    .eq('message_id', messageId);

  if (deleteError) {
    throw new Error(`Failed to clear recipients: ${deleteError.message}`);
  }

  const rows = getRecipientRows(messageId, payload);

  if (rows.length === 0) return;

  const { error } = await privateTable(admin, 'mail_recipients').insert(rows);

  if (error) {
    throw new Error(`Failed to persist recipients: ${error.message}`);
  }
}

async function ensureThread(
  admin: AnyRecord,
  mailboxId: string,
  subject: string
) {
  const normalizedSubject = subject
    .replace(/^(re|fw|fwd):\s*/giu, '')
    .trim()
    .toLowerCase();
  const { data: existing, error: existingError } = await privateTable(
    admin,
    'mail_threads'
  )
    .select('*')
    .eq('mailbox_id', mailboxId)
    .eq('normalized_subject', normalizedSubject)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to load mail thread: ${existingError.message}`);
  }

  if (existing) return existing;

  const { data, error } = await privateTable(admin, 'mail_threads')
    .insert({
      mailbox_id: mailboxId,
      normalized_subject: normalizedSubject,
      subject,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to create mail thread: ${error.message}`);
  }

  return data;
}

async function persistMessage(
  admin: AnyRecord,
  ctx: MailRouteContext,
  mailbox: MailMailbox,
  payload: CreateMailDraftPayload,
  status: 'draft' | 'queued'
) {
  const bodyHtml =
    payload.bodyHtml?.trim() || textToHtml(payload.bodyText ?? '');
  const sanitizedHtml = sanitizeMailHtml(bodyHtml);
  const bodyText =
    payload.bodyText?.trim() || createSnippet({ html: sanitizedHtml });
  const thread = await ensureThread(admin, mailbox.id, payload.subject.trim());
  const { data: message, error } = await privateTable(admin, 'mail_messages')
    .insert({
      body_html: bodyHtml,
      body_text: bodyText,
      created_by: ctx.user.id,
      direction: 'outbound',
      from_address: mailbox.address,
      from_name: mailbox.displayName,
      in_reply_to: payload.inReplyTo ?? null,
      mailbox_id: mailbox.id,
      references_headers: payload.references ?? [],
      sanitized_html: sanitizedHtml,
      snippet: createSnippet({ html: sanitizedHtml, text: bodyText }),
      status,
      subject: payload.subject.trim() || '(no subject)',
      thread_id: thread.id,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to persist mail message: ${error.message}`);
  }

  await replaceRecipients(admin, message.id, payload);

  return message;
}

export async function createMailDraft({
  ctx,
  mailboxId,
  payload,
}: {
  ctx: MailRouteContext;
  mailboxId: string;
  payload: CreateMailDraftPayload;
}) {
  const access = await requireMailboxAccess(ctx, mailboxId, [
    'admin',
    'owner',
    'sender',
  ]);
  if (!access) return null;

  const message = await persistMessage(
    access.admin,
    ctx,
    access.mailbox,
    payload,
    'draft'
  );
  return getMailMessage({ ctx, mailboxId, messageId: message.id });
}

export async function updateMailDraft({
  ctx,
  draftId,
  mailboxId,
  payload,
}: {
  ctx: MailRouteContext;
  draftId: string;
  mailboxId: string;
  payload: UpdateMailDraftPayload;
}) {
  const access = await requireMailboxAccess(ctx, mailboxId, [
    'admin',
    'owner',
    'sender',
  ]);
  if (!access) return null;

  const { data: current, error: currentError } = await privateTable(
    access.admin,
    'mail_messages'
  )
    .select('*')
    .eq('id', draftId)
    .eq('mailbox_id', mailboxId)
    .eq('status', 'draft')
    .maybeSingle();

  if (currentError) {
    throw new Error(`Failed to load draft: ${currentError.message}`);
  }

  if (!current) return null;

  const nextPayload: CreateMailDraftPayload = {
    bcc: [],
    cc: [],
    subject: current.subject,
    to: [],
    ...payload,
    bodyHtml: payload.bodyHtml ?? current.body_html,
    bodyText: payload.bodyText ?? current.body_text,
  };
  const bodyHtml =
    nextPayload.bodyHtml?.trim() || textToHtml(nextPayload.bodyText ?? '');
  const sanitizedHtml = sanitizeMailHtml(bodyHtml);

  const { error } = await privateTable(access.admin, 'mail_messages')
    .update({
      body_html: bodyHtml,
      body_text: nextPayload.bodyText ?? createSnippet({ html: sanitizedHtml }),
      sanitized_html: sanitizedHtml,
      snippet: createSnippet({
        html: sanitizedHtml,
        text: nextPayload.bodyText,
      }),
      subject: nextPayload.subject.trim() || '(no subject)',
    })
    .eq('id', draftId);

  if (error) {
    throw new Error(`Failed to update draft: ${error.message}`);
  }

  await replaceRecipients(access.admin, draftId, nextPayload);

  return getMailMessage({ ctx, mailboxId, messageId: draftId });
}

export async function deleteMailDraft({
  ctx,
  draftId,
  mailboxId,
}: {
  ctx: MailRouteContext;
  draftId: string;
  mailboxId: string;
}) {
  const access = await requireMailboxAccess(ctx, mailboxId, [
    'admin',
    'owner',
    'sender',
  ]);
  if (!access) return false;

  const { error } = await privateTable(access.admin, 'mail_messages')
    .delete()
    .eq('id', draftId)
    .eq('mailbox_id', mailboxId)
    .eq('status', 'draft');

  if (error) {
    throw new Error(`Failed to delete draft: ${error.message}`);
  }

  return true;
}
