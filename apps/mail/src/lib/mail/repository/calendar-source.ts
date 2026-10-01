import PostalMime from 'postal-mime';
import { readMailStoredObject } from '../storage';
import type { MailRouteContext } from '../types';
import { requireMailboxAccess } from './bootstrap';
import { mailMessageTable, privateTable } from './shared';

/** Legacy SES inboxes stored raw MIME but not decoded calendar attachment bytes. */
export async function readLegacyCalendarSource(
  ctx: MailRouteContext,
  mailboxId: string,
  messageId: string
) {
  const access = await requireMailboxAccess(ctx, mailboxId);
  if (!access) return null;
  const { data: message, error } = await mailMessageTable(access, ctx)
    .select('raw_message_id')
    .eq('id', messageId)
    .eq('mailbox_id', mailboxId)
    .maybeSingle();
  if (error) throw new Error('Failed to authorize invitation source');
  if (!message?.raw_message_id) return null;
  const { data: raw, error: rawError } = await privateTable(
    access.admin,
    'mail_raw_messages'
  )
    .select('provider,s3_bucket,s3_key,size_bytes,raw_headers')
    .eq('id', message.raw_message_id)
    .maybeSingle();
  if (rawError) throw new Error('Failed to load invitation source');
  if (
    raw?.provider !== 'ses' ||
    !raw.s3_bucket ||
    !raw.s3_key ||
    raw.size_bytes > 2 * 1024 * 1024
  )
    return null;
  const contentType = Object.entries(raw.raw_headers ?? {}).find(
    ([name]) => name.toLowerCase() === 'content-type'
  )?.[1];
  // Ordinary single-part messages cannot contain an invitation. Avoid fetching
  // their full stored MIME just to render the reader's optional calendar card.
  if (
    typeof contentType === 'string' &&
    !/^(?:multipart\/|text\/calendar(?:\s*;|$))/iu.test(contentType.trim())
  )
    return null;
  const bytes = await readMailStoredObject({
    provider: 's3',
    bucketName: raw.s3_bucket,
    objectKey: raw.s3_key,
  });
  if (bytes.byteLength > 2 * 1024 * 1024) return null;
  return calendarSourceFromMime(bytes);
}

export async function calendarSourceFromMime(bytes: Uint8Array) {
  const parsed = await PostalMime.parse(bytes, {
    attachmentEncoding: 'arraybuffer',
    maxHeadersSize: 256 * 1024,
    maxNestingDepth: 40,
  });
  const calendars = parsed.attachments.filter(
    (file) =>
      file.mimeType === 'text/calendar' || /\.ics$/iu.test(file.filename ?? '')
  );
  if (calendars.length !== 1) return null;
  const content = new Uint8Array(calendars[0]!.content as ArrayBuffer);
  if (content.byteLength > 256 * 1024) return null;
  return new TextDecoder('utf-8', { fatal: true }).decode(content);
}
