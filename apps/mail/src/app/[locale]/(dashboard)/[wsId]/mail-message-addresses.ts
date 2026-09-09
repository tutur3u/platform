import type { MailMessageDetail } from '@tuturuuu/internal-api';

export function formatMailSender(message: MailMessageDetail) {
  return message.fromName?.trim()
    ? `${message.fromName.trim()} <${message.fromAddress}>`
    : message.fromAddress;
}

export function formatMailRecipients(
  message: MailMessageDetail,
  kind: 'bcc' | 'cc' | 'to'
) {
  const recipients = message.recipients
    .filter((recipient) => recipient.kind === kind && recipient.address.trim())
    .map((recipient) =>
      recipient.displayName?.trim()
        ? `${recipient.displayName.trim()} <${recipient.address.trim()}>`
        : recipient.address.trim()
    );
  if (recipients.length) return [...new Set(recipients)].join(', ');
  // Catch-all delivery can have no parsed To header (including Bcc mail).
  // Use the recorded delivery address, never the catch-all mailbox owner.
  return kind === 'to'
    ? message.observedRecipient?.trim() || message.envelopeTo?.trim() || ''
    : '';
}
