import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import PostalMime, {
  type Address,
  type Email,
  type Header,
  type Mailbox,
} from 'postal-mime';

const MBOX_SEPARATOR =
  /^From \S+ (?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [ \d]\d \d\d:\d\d(?::\d\d)?(?: [+-]\d{4})? \d{4}(?: .*)?$/u;

const SYSTEM_LABEL_SLUGS = new Map([
  ['archived', 'archive'],
  ['draft', 'drafts'],
  ['drafts', 'drafts'],
  ['inbox', 'inbox'],
  ['sent', 'sent'],
  ['spam', 'spam'],
  ['starred', 'starred'],
  ['trash', 'trash'],
]);

export type TakeoutMessage = {
  attachmentBytes: number;
  date: string;
  direction: 'inbound' | 'outbound';
  email: Email;
  gmailLabels: string[];
  gmailThreadId: string | null;
  isArchived: boolean;
  isRead: boolean;
  isStarred: boolean;
  isTrashed: boolean;
  providerMessageId: string;
  raw: Uint8Array;
  rawSha256: string;
  status: 'draft' | 'quarantined' | 'received' | 'sent';
  systemLabelSlugs: string[];
};

function isMboxSeparator(line: Buffer) {
  return MBOX_SEPARATOR.test(line.toString('ascii').replace(/\r?\n$/u, ''));
}

function restoreMboxrdLine(line: Buffer) {
  let markerLength = 0;
  while (line[markerLength] === 62) markerLength += 1;
  return markerLength > 0 &&
    line.subarray(markerLength, markerLength + 5).toString('ascii') === 'From '
    ? line.subarray(1)
    : line;
}

export async function* readMboxMessages(path: string) {
  let pending: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  let message: Buffer[] = [];
  let messageBytes = 0;

  const emitMessage = () => {
    if (messageBytes === 0) return null;
    const raw = Buffer.concat(message, messageBytes);
    message = [];
    messageBytes = 0;
    return raw;
  };

  for await (const chunk of createReadStream(path)) {
    const data = pending.length
      ? Buffer.concat([pending, chunk as Buffer])
      : (chunk as Buffer);
    let offset = 0;
    let newline = data.indexOf(10, offset);
    while (newline >= 0) {
      const line = data.subarray(offset, newline + 1);
      if (isMboxSeparator(line)) {
        const raw = emitMessage();
        if (raw) yield raw;
      } else {
        const restored = restoreMboxrdLine(line);
        message.push(restored);
        messageBytes += restored.length;
      }
      offset = newline + 1;
      newline = data.indexOf(10, offset);
    }
    pending = data.subarray(offset);
  }

  if (pending.length && !isMboxSeparator(pending)) {
    const restored = restoreMboxrdLine(pending);
    message.push(restored);
    messageBytes += restored.length;
  }
  const raw = emitMessage();
  if (raw) yield raw;
}

function headerValues(headers: Header[], key: string) {
  return headers
    .filter((header) => header.key.toLowerCase() === key)
    .map((header) => header.value);
}

export function normalizeGmailLabels(headers: Header[]) {
  return [
    ...new Set(
      headerValues(headers, 'x-gmail-labels')
        .flatMap((value) => value.split(','))
        .map((label) => label.replaceAll(/\s+/gu, ' ').trim())
        .filter(Boolean)
    ),
  ];
}

function hasLabel(labels: string[], value: string) {
  return labels.some((label) => label.toLowerCase() === value);
}

export function flattenAddresses(addresses?: Address[]) {
  return (addresses ?? []).flatMap((address) =>
    'group' in address ? address.group : [address]
  );
}

export function mailboxAddress(address?: Address) {
  if (!address || 'group' in address) return null;
  return address as Mailbox;
}

function resolveMessageDate(email: Email) {
  const date = email.date ? new Date(email.date) : new Date(0);
  return Number.isNaN(date.getTime())
    ? new Date(0).toISOString()
    : date.toISOString();
}

export async function parseTakeoutMessage({
  account,
  deletedMbox,
  raw,
}: {
  account: string;
  deletedMbox: boolean;
  raw: Uint8Array;
}): Promise<TakeoutMessage> {
  const email = await PostalMime.parse(raw, {
    attachmentEncoding: 'arraybuffer',
  });
  const gmailLabels = normalizeGmailLabels(email.headers);
  const rawSha256 = createHash('sha256').update(raw).digest('hex');
  const isDraft = hasLabel(gmailLabels, 'drafts');
  const isSent = hasLabel(gmailLabels, 'sent');
  const isSpam = hasLabel(gmailLabels, 'spam');
  const isTrashed = deletedMbox || hasLabel(gmailLabels, 'trash');
  const isArchived =
    hasLabel(gmailLabels, 'archived') ||
    (!hasLabel(gmailLabels, 'inbox') &&
      !isDraft &&
      !isSent &&
      !isSpam &&
      !isTrashed);
  const systemLabelSlugs = [
    ...new Set(
      gmailLabels
        .map((label) => SYSTEM_LABEL_SLUGS.get(label.toLowerCase()))
        .filter((label): label is string => Boolean(label))
        .concat(isArchived ? ['archive'] : [])
        .concat(isTrashed ? ['trash'] : [])
    ),
  ];
  const gmailThreadId =
    headerValues(email.headers, 'x-gm-thrid')[0]?.trim() || null;

  return {
    attachmentBytes: email.attachments.reduce(
      (sum, attachment) =>
        sum +
        (typeof attachment.content === 'string'
          ? Buffer.byteLength(attachment.content)
          : attachment.content.byteLength),
      0
    ),
    date: resolveMessageDate(email),
    direction: isDraft || isSent ? 'outbound' : 'inbound',
    email,
    gmailLabels,
    gmailThreadId,
    isArchived,
    isRead: !hasLabel(gmailLabels, 'unread'),
    isStarred: hasLabel(gmailLabels, 'starred'),
    isTrashed,
    providerMessageId: `${account}:${rawSha256}`,
    raw,
    rawSha256,
    status: isDraft
      ? 'draft'
      : isSpam
        ? 'quarantined'
        : isSent
          ? 'sent'
          : 'received',
    systemLabelSlugs,
  };
}

export function deterministicUuid(namespace: string, value: string) {
  const bytes = createHash('sha256')
    .update(`${namespace}\0${value}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function slugifyGoogleLabel(value: string) {
  return value
    .normalize('NFKD')
    .replaceAll(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, '-')
    .replaceAll(/^-|-$/gu, '')
    .slice(0, 80);
}
