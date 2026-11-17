import type { MailMessageDetail } from '@tuturuuu/internal-api';
import { mailAddressDomain } from './mail-person-display';

/**
 * Safe header names arrive lowercased, so known ones map to translated
 * sentence-case labels under `mail.message_details_panel`.
 */
const LABEL_KEYS = {
  from: 'from',
  'reply-to': 'reply_to',
  to: 'to',
  cc: 'cc',
  bcc: 'bcc',
  date: 'date',
  'message-id': 'message_id',
  'in-reply-to': 'in_reply_to',
  'original-recipient': 'original_recipient',
  'mailed-by': 'mailed_by',
  'x-failed-recipients': 'failed_recipients',
} as const;

export type MessageDetailLabelKey =
  (typeof LABEL_KEYS)[keyof typeof LABEL_KEYS];

export function messageDetailLabelKey(
  header: string
): MessageDetailLabelKey | null {
  const name = header.trim().toLowerCase();
  return Object.hasOwn(LABEL_KEYS, name)
    ? LABEL_KEYS[name as keyof typeof LABEL_KEYS]
    : null;
}

export type MailAddress = { address: string; name: string | null };

function splitAddressList(value: string) {
  const parts: string[] = [];
  let current = '';
  let quoted = false;
  let angle = 0;
  for (const char of value) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && char === '<') angle += 1;
    else if (!quoted && char === '>') angle = Math.max(0, angle - 1);
    if (char === ',' && !quoted && angle === 0) {
      parts.push(current);
      current = '';
    } else current += char;
  }
  parts.push(current);
  return parts;
}

/** Parses an RFC 5322 address list such as `"A" <a@x.com>, b@y.com`. */
export function parseMailAddressList(value: string | null | undefined) {
  if (!value) return [];
  const addresses: MailAddress[] = [];
  for (const part of splitAddressList(value)) {
    const entry = part.trim();
    const bracketed = /^(.*)<([^<>\s]+@[^<>\s]+)>$/u.exec(entry);
    if (bracketed) {
      const name = bracketed[1]?.trim().replace(/^"|"$/gu, '').trim();
      addresses.push({ address: bracketed[2]!.trim(), name: name || null });
    } else if (/^[^\s@<>]+@[^\s@<>]+$/u.test(entry))
      addresses.push({ address: entry, name: null });
  }
  return uniqueMailAddresses(addresses);
}

export function uniqueMailAddresses(addresses: readonly MailAddress[]) {
  const seen = new Set<string>();
  return addresses.filter((item) => {
    const key = item.address.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function recipientsOfKind(
  message: MailMessageDetail,
  kind: MailMessageDetail['recipients'][number]['kind']
) {
  return uniqueMailAddresses(
    message.recipients
      .filter((item) => item.kind === kind)
      .map((item) => ({
        address: item.address.trim(),
        name: item.displayName?.trim() || null,
      }))
  );
}

/**
 * To recipients for the message header. Catch-all delivery can have no parsed
 * To header, so it falls back to the recorded delivery address.
 */
export function messageHeaderRecipients(message: MailMessageDetail) {
  const to = recipientsOfKind(message, 'to');
  if (to.length) return to;
  const delivered =
    message.observedRecipient?.trim() || message.envelopeTo?.trim();
  return delivered ? [{ address: delivered, name: null }] : [];
}

export type MessagePeopleGroup = {
  key: 'from' | 'reply_to' | 'to' | 'cc' | 'bcc';
  people: MailAddress[];
};

export function messagePeopleGroups(
  message: MailMessageDetail
): MessagePeopleGroup[] {
  const replyTo = recipientsOfKind(message, 'reply_to');
  const groups: MessagePeopleGroup[] = [
    {
      key: 'from',
      people: [
        {
          address: message.fromAddress.trim(),
          name: message.fromName?.trim() || null,
        },
      ],
    },
    {
      key: 'reply_to',
      people: replyTo.length
        ? replyTo
        : parseMailAddressList(message.safeHeaders['reply-to']),
    },
    { key: 'to', people: recipientsOfKind(message, 'to') },
    { key: 'cc', people: recipientsOfKind(message, 'cc') },
    { key: 'bcc', people: recipientsOfKind(message, 'bcc') },
  ];
  return groups.filter((group) =>
    group.people.some((person) => person.address)
  );
}

export type MessageDeliveryRow =
  | { kind: 'date'; iso: string | null; raw: string | null }
  | { kind: 'id'; key: 'message_id' | 'in_reply_to'; value: string }
  | { kind: 'person'; key: 'original_recipient'; person: MailAddress }
  | {
      kind: 'text';
      header: string;
      label: MessageDetailLabelKey | null;
      value: string;
    };

const HANDLED_HEADERS = new Set([
  'bcc',
  'cc',
  'date',
  'from',
  'in-reply-to',
  'message-id',
  'reply-to',
  'subject',
  'to',
]);

export function messageDeliveryRows(
  message: MailMessageDetail
): MessageDeliveryRow[] {
  const headers = message.safeHeaders;
  const rows: MessageDeliveryRow[] = [];
  const iso = message.receivedAt ?? message.sentAt;
  const raw = headers.date?.trim() || null;
  if (iso || raw) rows.push({ kind: 'date', iso, raw });
  const mailedBy = mailAddressDomain(message.envelopeFrom ?? '');
  if (mailedBy)
    rows.push({
      kind: 'text',
      header: 'mailed-by',
      label: 'mailed_by',
      value: mailedBy,
    });
  const messageId =
    message.internetMessageId?.trim() || headers['message-id']?.trim();
  if (messageId) rows.push({ kind: 'id', key: 'message_id', value: messageId });
  const inReplyTo = message.inReplyTo?.trim() || headers['in-reply-to']?.trim();
  if (inReplyTo)
    rows.push({ kind: 'id', key: 'in_reply_to', value: inReplyTo });
  if (message.observedRecipient?.trim())
    rows.push({
      kind: 'person',
      key: 'original_recipient',
      person: { address: message.observedRecipient.trim(), name: null },
    });
  for (const [header, value] of Object.entries(headers)) {
    const name = header.toLowerCase();
    if (HANDLED_HEADERS.has(name) || typeof value !== 'string' || !value.trim())
      continue;
    rows.push({
      kind: 'text',
      header: name,
      label: messageDetailLabelKey(name),
      value: value.trim(),
    });
  }
  return rows;
}

/** Local date and time with the zone, e.g. "Tue, Nov 17, 2026, 10:52 AM GMT+7". */
export function formatMailDetailDate(
  value: string | null | undefined,
  locale: string,
  timeZone?: string
) {
  const date = new Date(value ?? '');
  if (!value || !Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone,
  }).format(date);
}

/** Message IDs longer than this start truncated behind a "Show all" toggle. */
export const MESSAGE_ID_PREVIEW_LENGTH = 48;
