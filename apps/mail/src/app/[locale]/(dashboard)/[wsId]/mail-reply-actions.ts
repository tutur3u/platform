import type { MailMailbox, MailMessageDetail } from '@tuturuuu/internal-api';
import type { ComposeInitialDraft } from './mail-composer-types';
import { escapeHtml, forwardSubject, replySubject } from './mail-reply-utils';

export function createMailReplyActions(
  t: (key: 'quoted_message', values: { sender: string }) => string,
  mailboxes: MailMailbox[],
  openCompose: (draft: ComposeInitialDraft | null) => Promise<void>
) {
  const ownAddresses = new Set(
    mailboxes.map((mailbox) => mailbox.address.toLowerCase())
  );
  const replyRecipients = (message: MailMessageDetail) => {
    if (ownAddresses.has(message.fromAddress.toLowerCase()))
      return message.recipients.filter(
        (item) =>
          item.kind === 'to' && !ownAddresses.has(item.address.toLowerCase())
      );
    const recipients = message.recipients.filter(
      (item) => item.kind === 'reply_to'
    );
    return recipients.length
      ? recipients
      : [{ address: message.fromAddress, displayName: message.fromName }];
  };
  const replyReferences = (message: MailMessageDetail) => [
    ...new Set([
      ...message.references,
      ...(message.internetMessageId ? [message.internetMessageId] : []),
    ]),
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
    const unique = (
      recipients: { address: string; displayName?: string | null }[]
    ) => [
      ...new Map(
        recipients
          .filter(({ address }) => !ownAddresses.has(address.toLowerCase()))
          .map((recipient) => [recipient.address.toLowerCase(), recipient])
      ).values(),
    ];
    const to = unique([
      ...replyRecipients(message),
      ...message.recipients.filter((recipient) => recipient.kind === 'to'),
    ]);
    const cc = unique(
      message.recipients.filter((recipient) => recipient.kind === 'cc')
    ).filter(
      (recipient) =>
        !to.some(
          (target) =>
            target.address.toLowerCase() === recipient.address.toLowerCase()
        )
    );
    const recipients = [...to, ...cc];
    return openCompose({
      bodyHtml: quote(message),
      quotedAttachments: message.attachments,
      cc: cc.map((recipient) => recipient.address),
      sourceMessageId: message.id,
      sourceAttachmentIds: message.attachments
        .filter((item) => item.contentId)
        .map((item) => item.id),
      inReplyTo: message.internetMessageId,
      recipientDisplayNames: Object.fromEntries(
        recipients.flatMap((recipient) =>
          recipient.displayName
            ? [[recipient.address.toLowerCase(), recipient.displayName]]
            : []
        )
      ),
      references: replyReferences(message),
      subject: replySubject(message.subject),
      threadId: message.threadId ?? undefined,
      to: to.map((recipient) => recipient.address),
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
