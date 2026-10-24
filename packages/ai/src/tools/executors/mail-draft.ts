import type { InternalApiClientOptions } from '@tuturuuu/internal-api/client';
import {
  createMailDraft,
  generateMailAiDraft,
  getMailBootstrap,
  getMailThread,
} from '@tuturuuu/internal-api/mail';
import {
  buildReplyRecipients,
  MAIL_UNTRUSTED_NOTICE,
  normalizeWhitespace,
  replyReferences,
  replySubject,
  truncateText,
} from './mail-helpers';

const DRAFT_NOTE =
  'Draft created in Mail. It has NOT been sent. Tell the user you created a draft and that they review and send it in Mail. Retrying with the same replyToMessageId and content returns this same draft.';

export type MailDraftIdentity = {
  userId: string;
  wsId: string;
  chatId?: string;
};

const optionalString = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

/**
 * Stable idempotency key for one reply draft, sent to Mail as
 * `clientMessageId`. It deliberately excludes the tool-call id: after a lost
 * response the model retries with a new call id, and that retry must resolve
 * to the same draft. The key is scoped to the user, workspace, mailbox, thread,
 * the message being replied to, reply mode, chat, and normalized content, so a
 * new inbound message in the same thread starts a new operation instead of
 * resolving to an earlier draft (or one already sent). It is formatted as an RFC 9562
 * version 8 UUID because Mail validates it as a UUID.
 */
export async function draftOperationId(input: {
  identity: MailDraftIdentity;
  mailboxId: string;
  threadId: string;
  replyToMessageId: string;
  replyAll: boolean;
  source: 'body' | 'instructions';
  content: string;
}) {
  const material = JSON.stringify([
    'mira-mail-draft:v2',
    input.identity.userId,
    input.identity.wsId,
    input.identity.chatId ?? '',
    input.mailboxId,
    input.threadId,
    input.replyToMessageId,
    input.replyAll,
    input.source,
    normalizeWhitespace(input.content.normalize('NFC')),
  ]);
  const digest = new Uint8Array(
    await globalThis.crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(material)
    )
  ).slice(0, 16);
  digest[6] = ((digest[6] ?? 0) & 0x0f) | 0x80;
  digest[8] = ((digest[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...digest]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function draftEmailReply(
  identity: MailDraftIdentity,
  args: Record<string, unknown>,
  options: InternalApiClientOptions
) {
  const { wsId } = identity;
  const mailboxId = optionalString(args.mailboxId);
  const threadId = optionalString(args.threadId);
  const body = optionalString(args.body);
  const instructions = optionalString(args.instructions);
  const replyToMessageId = optionalString(args.replyToMessageId);
  if (!mailboxId || !threadId)
    return { success: false, error: 'mailboxId and threadId are required.' };
  if (!body && !instructions)
    return {
      success: false,
      error:
        'Provide either a reply body or instructions for the Mail draft assistant.',
    };
  const replyAll = args.replyAll === true;
  const [bootstrap, detail] = await Promise.all([
    getMailBootstrap(wsId, options, false),
    getMailThread(wsId, mailboxId, threadId, options),
  ]);
  // A retry pins the original reply target so a newer inbound message in the
  // same thread cannot change which operation the retry belongs to.
  const target = [...(detail.messages ?? [])]
    .reverse()
    .find(
      (message) =>
        message.status !== 'draft' &&
        (!replyToMessageId || message.id === replyToMessageId)
    );
  if (!target)
    return {
      success: false,
      error: replyToMessageId
        ? 'That message is not a sent or received message in this thread. No draft was created.'
        : 'This thread has no sent or received message to reply to.',
    };
  const ownAddresses = new Set(
    (bootstrap.mailboxes ?? []).map((mailbox) => mailbox.address.toLowerCase())
  );
  const recipients = buildReplyRecipients(target, ownAddresses, replyAll);
  if (recipients.to.length === 0)
    return {
      success: false,
      error: 'Could not determine who to reply to. No draft was created.',
    };
  const subject = replySubject(target.subject);
  const clientMessageId = await draftOperationId({
    identity,
    mailboxId,
    threadId,
    replyToMessageId: target.id,
    replyAll,
    source: body ? 'body' : 'instructions',
    content: body ?? instructions ?? '',
  });

  let bodyText = body;
  let bodySource: 'model' | 'mail_ai' = 'model';
  if (!bodyText) {
    const generated = await generateMailAiDraft(
      wsId,
      mailboxId,
      {
        instructions: (instructions ?? '').slice(0, 4000),
        mode: 'draft',
        recipients: recipients.to,
        subject,
        threadId,
      },
      options
    );
    bodyText = generated.content?.trim();
    bodySource = 'mail_ai';
    if (!bodyText)
      return {
        success: false,
        error:
          'The Mail draft assistant returned an empty reply. No draft was created.',
      };
  }

  // Draft only: this tool never calls the Mail send endpoint. Mail returns the
  // existing message for a repeated clientMessageId instead of a second draft.
  const created = await createMailDraft(
    wsId,
    mailboxId,
    {
      bodyText: bodyText.slice(0, 20_000),
      cc: recipients.cc,
      clientMessageId,
      inReplyTo: target.internetMessageId,
      recipientDisplayNames: recipients.displayNames,
      references: replyReferences(target),
      subject,
      to: recipients.to,
    },
    options
  );
  // Mail may return an existing, user-edited draft for this key; report what
  // Mail stored, not what this call computed.
  const stored = created.message.recipients ?? [];
  const storedAddresses = (kind: 'to' | 'cc') =>
    stored.filter((item) => item.kind === kind).map((item) => item.address);
  if (created.message.status !== 'draft')
    return {
      success: false,
      error: `This exact reply was already ${created.message.status === 'sent' ? 'sent' : `processed (status: ${created.message.status})`} from Mail. No new draft was created.`,
      draftId: created.message.id,
      sent: created.message.status === 'sent',
    };
  return {
    success: true,
    status: 'draft created',
    sent: false,
    workspaceId: wsId,
    draftId: created.message.id,
    mailboxId,
    threadId: created.message.threadId ?? threadId,
    replyToMessageId: target.id,
    bodySource,
    note: DRAFT_NOTE,
    contentTrust: MAIL_UNTRUSTED_NOTICE,
    untrusted: {
      subject: created.message.subject || subject,
      to: storedAddresses('to'),
      cc: storedAddresses('cc'),
      bodyPreview: truncateText(created.message.bodyText ?? bodyText, 600).text,
    },
  };
}
