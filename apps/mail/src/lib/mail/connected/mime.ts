import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const address = z.email().max(320);
const messageId = z
  .string()
  .max(900)
  .regex(/^<[^\s<>]+>$/u);
export const composeSchema = z
  .object({
    requestId: z.uuid(),
    to: z.array(address).max(50),
    cc: z.array(address).max(50).default([]),
    bcc: z.array(address).max(50).default([]),
    subject: z
      .string()
      .max(998)
      .refine((value) => !/[\r\n]/u.test(value)),
    text: z.string().max(1000000).default(''),
    html: z.string().max(1000000).optional(),
    inReplyTo: messageId.optional(),
    references: z.array(messageId).max(100).default([]),
    draftId: z.string().min(1).max(2048).optional(),
    sourceId: z.string().min(1).max(2048).optional(),
    mode: z.enum(['reply', 'reply_all', 'forward']).optional(),
    attachmentIds: z
      .array(z.string().regex(/^\d{1,3}$/u))
      .max(50)
      .default([]),
    attachments: z
      .array(
        z.object({
          filename: z
            .string()
            .min(1)
            .max(255)
            .refine((value) => !/[\r\n]/u.test(value)),
          contentType: z
            .string()
            .max(160)
            .regex(/^[\w.+-]+\/[\w.+-]+(?:; charset=UTF-8; method=REPLY)?$/u),
          base64: z
            .string()
            .max(14000000)
            .regex(/^[A-Za-z0-9+/]*={0,2}$/u),
        })
      )
      .max(20)
      .default([]),
  })
  .refine((value) => value.to.length + value.cc.length + value.bcc.length > 0, {
    message: 'At least one recipient is required',
  })
  .refine(
    (value) => value.to.length + value.cc.length + value.bcc.length <= 50,
    { message: 'Too many recipients' }
  );
export type ComposePayload = z.infer<typeof composeSchema>;
export type MimeAttachment = {
  filename: string;
  contentType: string;
  content: Uint8Array;
  contentId?: string;
};
const encoded = (value: string) => {
  const words: string[] = [];
  let chunk = '';
  for (const character of value) {
    if (Buffer.byteLength(chunk + character) > 45) {
      words.push(chunk);
      chunk = '';
    }
    chunk += character;
  }
  words.push(chunk);
  return words
    .map((word) => `=?UTF-8?B?${Buffer.from(word).toString('base64')}?=`)
    .join('\r\n ');
};
const base64Lines = (value: Uint8Array | string) =>
  Buffer.from(value)
    .toString('base64')
    .match(/.{1,76}/gu)
    ?.join('\r\n') ?? '';
export function buildMime(
  from: string,
  payload: ComposePayload,
  attachments: MimeAttachment[] = []
) {
  // Revalidate even server-derived data at the transport boundary.
  address.parse(from);
  composeSchema.parse(payload);
  const boundary = `mail-${randomUUID()}`;
  const headers = [
    `From: ${from}`,
    `To: ${payload.to.join(',\r\n ')}`,
    ...(payload.cc.length ? [`Cc: ${payload.cc.join(',\r\n ')}`] : []),
    ...(payload.bcc.length ? [`Bcc: ${payload.bcc.join(',\r\n ')}`] : []),
    `Subject: ${encoded(payload.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${payload.requestId}@${from.split('@')[1]}>`,
    'MIME-Version: 1.0',
    ...(payload.inReplyTo ? [`In-Reply-To: ${payload.inReplyTo}`] : []),
    ...(payload.references.length
      ? [`References: ${payload.references.join('\r\n ')}`]
      : []),
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    `Content-Type: text/${payload.html ? 'html' : 'plain'}; charset=UTF-8`,
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(payload.html ?? payload.text),
  ];
  for (const file of attachments) {
    if (
      /[\r\n]/u.test(file.filename) ||
      !/^[\w.+-]+\/[\w.+-]+(?:; charset=UTF-8; method=REPLY)?$/u.test(
        file.contentType
      )
    )
      throw new Error('Invalid attachment headers');
    headers.push(
      `--${boundary}`,
      `Content-Type: ${file.contentType}`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      '',
      base64Lines(file.content)
    );
  }
  headers.push(`--${boundary}--`, '');
  const raw = Buffer.from(headers.join('\r\n'));
  if (raw.byteLength > 20 * 1024 * 1024)
    throw new Error('Message exceeds send limit');
  return raw;
}
