import type { MailMailbox, MailMessageDetail } from '@tuturuuu/internal-api';
import type { ComposeInitialDraft } from './mail-composer-types';
import { escapeHtml, forwardSubject, replySubject } from './mail-reply-utils';

export function createMailReplyActions(
  t: (key: 'quoted_message', values: { sender: string }) => string,
  mailboxes: MailMailbox[],
  openCompose: (draft: ComposeInitialDraft | null) => Promise<void>
) {
  const replyRecipients = (message: MailMessageDetail) => {
    const recipients = message.recipients.filter(
      (item) => item.kind === 'reply_to'
    );
    return recipients.length
      ? recipients
      : [{ address: message.fromAddress, displayName: message.fromName }];
  };
  const replyReferences = (message: MailMessageDetail) => [
    ...message.references,
    ...(message.internetMessageId ? [message.internetMessageId] : []),
  ];
  const quote = (message: MailMessageDetail) =>
    `<p><br></p><blockquote type="cite"><p>${escapeHtml(t('quoted_message', { sender: message.fromName || message.fromAddress }))}</p>${message.sanitizedHtml || `<p>${escapeHtml(message.bodyText ?? '').replaceAll('\n', '<br>')}</p>`}</blockquote>`;
  const handleReply = (message: MailMessageDetail) =>
    openCompose({
      bodyHtml: quote(message),
      quotedAttachments: message.attachments,
      sourceMessageId: message.id,
      sourceAttachmentIds: message.attachments
        .filter((item) => item.contentId)
        .map((item) => item.id),
      inReplyTo: message.internetMessageId,
      recipientDisplayNames: Object.fromEntries(
        replyRecipients(message).flatMap((item) =>
          item.displayName
            ? [[item.address.toLowerCase(), item.displayName]]
            : []
        )
      ),
      references: replyReferences(message),
      subject: replySubject(message.subject),
      threadId: message.threadId ?? undefined,
      to: replyRecipients(message).map((item) => item.address),
    });
  const handleReplyAll = (message: MailMessageDetail) => {
    const excluded = new Set(
      mailboxes.map((mailbox) => mailbox.address.toLowerCase())
    );
    const candidates = [
      ...replyRecipients(message),
      ...message.recipients
        .filter(
          (recipient) => recipient.kind === 'to' || recipient.kind === 'cc'
        )
        .map((recipient) => ({
          address: recipient.address,
          displayName: recipient.displayName,
        })),
    ].filter(({ address }) => !excluded.has(address.toLowerCase()));
    const unique = [
      ...new Map(
        candidates.map((recipient) => [
          recipient.address.toLowerCase(),
          recipient,
        ])
      ).values(),
    ];
    openCompose({
      bodyHtml: quote(message),
      quotedAttachments: message.attachments,
      cc: unique.slice(1).map((recipient) => recipient.address),
      sourceMessageId: message.id,
      sourceAttachmentIds: message.attachments
        .filter((item) => item.contentId)
        .map((item) => item.id),
      inReplyTo: message.internetMessageId,
      recipientDisplayNames: Object.fromEntries(
        unique.flatMap((recipient) =>
          recipient.displayName
            ? [[recipient.address.toLowerCase(), recipient.displayName]]
            : []
        )
      ),
      references: replyReferences(message),
      subject: replySubject(message.subject),
      threadId: message.threadId ?? undefined,
      to: unique.slice(0, 1).map((recipient) => recipient.address),
    });
  };
  const handleForward = (message: MailMessageDetail) =>
    openCompose({
      bodyHtml: quote(message),
      quotedAttachments: message.attachments,
      sourceAttachmentIds: message.attachments.map(
        (attachment) => attachment.id
      ),
      sourceMessageId: message.id,
      subject: forwardSubject(message.subject),
      threadId: message.threadId ?? undefined,
      to: [],
    });

  return { handleReply, handleReplyAll, handleForward };
}
