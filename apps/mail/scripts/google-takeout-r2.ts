import { createHash } from 'node:crypto';
import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { Attachment } from 'postal-mime';
import { deterministicUuid } from '../src/lib/mail/import/google-takeout';
import type {
  PreparedImportMessage,
  StoredObjectRow,
} from './google-takeout-db';

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function bytes(value: Attachment['content']) {
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  return Buffer.from(value);
}

function sha256(value: Uint8Array) {
  return createHash('sha256').update(value).digest('hex');
}

function createR2Client() {
  const accountId = requiredEnv('MAIL_R2_ACCOUNT_ID');
  return new S3Client({
    credentials: {
      accessKeyId: requiredEnv('MAIL_R2_ACCESS_KEY_ID'),
      secretAccessKey: requiredEnv('MAIL_R2_SECRET_ACCESS_KEY'),
    },
    endpoint:
      process.env.MAIL_R2_ENDPOINT ??
      `https://${accountId}.r2.cloudflarestorage.com`,
    region: 'auto',
  });
}

export function createTakeoutObjectStore() {
  const client = createR2Client();
  const bucketName =
    process.env.MAIL_R2_BUCKET_NAME ?? requiredEnv('MAIL_R2_BUCKET');

  async function put({
    body,
    contentType,
    key,
    hash,
  }: {
    body: Uint8Array;
    contentType: string;
    hash: string;
    key: string;
  }) {
    try {
      const existing = await client.send(
        new HeadObjectCommand({ Bucket: bucketName, Key: key })
      );
      if (
        existing.ContentLength === body.byteLength &&
        existing.Metadata?.sha256 === hash
      ) {
        return;
      }
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } })
        .$metadata?.httpStatusCode;
      if (status !== 404) throw error;
    }
    await client.send(
      new PutObjectCommand({
        Body: body,
        Bucket: bucketName,
        ContentType: contentType,
        Key: key,
        Metadata: { sha256: hash },
      })
    );
  }

  return { bucketName, put };
}

export async function uploadTakeoutMessage({
  account,
  message,
  objectStore,
}: {
  account: string;
  message: Omit<PreparedImportMessage, 'attachmentRows' | 'storedObjects'>;
  objectStore: ReturnType<typeof createTakeoutObjectStore>;
}) {
  const accountKey = encodeURIComponent(account);
  const rawKey = `migration/google-takeout/v1/${accountKey}/raw/${message.rawSha256}.eml`;
  const rawObjectId = deterministicUuid('mail-stored-object', rawKey);
  await objectStore.put({
    body: message.raw,
    contentType: 'message/rfc822',
    hash: message.rawSha256,
    key: rawKey,
  });
  const storedObjects: StoredObjectRow[] = [
    {
      bucket_name: objectStore.bucketName,
      content_type: 'message/rfc822',
      filename: `${message.rawSha256}.eml`,
      id: rawObjectId,
      mailbox_id: message.mailboxId,
      message_id: message.messageId,
      object_key: rawKey,
      object_kind: 'raw_mime',
      provider: 'r2',
      provider_metadata: {
        import: 'google_takeout',
        providerMessageId: message.providerMessageId,
      },
      sha256: message.rawSha256,
      size_bytes: message.raw.byteLength,
    },
  ];
  const attachmentRows = [];
  for (const [index, attachment] of message.email.attachments.entries()) {
    const content = bytes(attachment.content);
    const hash = sha256(content);
    const key = `migration/google-takeout/v1/${accountKey}/attachments/${message.rawSha256}/${index}-${hash}`;
    const objectId = deterministicUuid('mail-stored-object', key);
    const attachmentId = deterministicUuid(
      'google-takeout-attachment',
      `${message.messageId}:${index}:${hash}`
    );
    const disposition =
      attachment.disposition === 'inline' ? 'inline' : 'attachment';
    const filename = attachment.filename?.trim() || `attachment-${index + 1}`;
    await objectStore.put({
      body: content,
      contentType: attachment.mimeType || 'application/octet-stream',
      hash,
      key,
    });
    storedObjects.push({
      bucket_name: objectStore.bucketName,
      content_id: attachment.contentId ?? null,
      content_disposition: disposition,
      content_type: attachment.mimeType || 'application/octet-stream',
      filename,
      id: objectId,
      mailbox_id: message.mailboxId,
      message_id: message.messageId,
      object_key: key,
      object_kind: 'attachment',
      provider: 'r2',
      provider_metadata: { import: 'google_takeout' },
      sha256: hash,
      size_bytes: content.byteLength,
    });
    attachmentRows.push({
      content_id: attachment.contentId ?? null,
      content_type: attachment.mimeType || 'application/octet-stream',
      disposition,
      filename,
      id: attachmentId,
      message_id: message.messageId,
      raw_message_id: message.rawMessageId,
      sha256: hash,
      size_bytes: content.byteLength,
      stored_object_id: objectId,
    });
  }
  return { attachmentRows, storedObjects };
}
