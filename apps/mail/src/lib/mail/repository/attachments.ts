import { createHash, randomUUID } from 'node:crypto';
import type { EmailAttachment } from '@tuturuuu/email-service';
import {
  deleteMailStoredObject,
  getMailR2BucketName,
  type MailStoredObjectLocation,
  putMailStoredObject,
  readMailStoredObject,
} from '../storage';
import type { MailRouteContext } from '../types';
import { requireMailboxAccess } from './bootstrap';
import { type AnyRecord, privateTable } from './shared';

export const MAX_MAIL_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_MAIL_ATTACHMENTS = 32;

function r2Location(row: AnyRecord): MailStoredObjectLocation {
  return {
    bucketName: row.bucket_name,
    objectKey: row.object_key,
    provider: row.provider,
  };
}

export async function getAuthorizedAttachment({
  attachmentId,
  ctx,
  mailboxId,
  messageId,
}: {
  attachmentId: string;
  ctx: MailRouteContext;
  mailboxId: string;
  messageId: string;
}) {
  const access = await requireMailboxAccess(ctx, mailboxId);
  if (!access) return null;
  const { data: attachment, error } = await privateTable(
    access.admin,
    'mail_attachments'
  )
    .select('*')
    .eq('id', attachmentId)
    .eq('message_id', messageId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load attachment: ${error.message}`);
  if (!attachment) return null;

  const { data: message, error: messageError } = await privateTable(
    access.admin,
    'mail_messages'
  )
    .select('id')
    .eq('id', messageId)
    .eq('mailbox_id', mailboxId)
    .maybeSingle();
  if (messageError)
    throw new Error(`Failed to authorize attachment: ${messageError.message}`);
  if (!message) return null;

  if (attachment.stored_object_id) {
    const { data: storedObject, error: objectError } = await privateTable(
      access.admin,
      'mail_stored_objects'
    )
      .select('*')
      .eq('id', attachment.stored_object_id)
      .eq('mailbox_id', mailboxId)
      .eq('message_id', messageId)
      .is('deleted_at', null)
      .maybeSingle();
    if (objectError)
      throw new Error(`Failed to load stored object: ${objectError.message}`);
    if (!storedObject) return null;
    return { attachment, location: r2Location(storedObject) };
  }

  if (!attachment.storage_bucket || !attachment.storage_key) return null;
  return {
    attachment,
    location: {
      bucketName: attachment.storage_bucket,
      objectKey: attachment.storage_key,
      provider: 's3' as const,
    },
  };
}

export async function uploadDraftAttachment({
  bytes,
  contentType,
  ctx,
  draftId,
  filename,
  mailboxId,
}: {
  bytes: Uint8Array;
  contentType: string;
  ctx: MailRouteContext;
  draftId: string;
  filename: string;
  mailboxId: string;
}) {
  const access = await requireMailboxAccess(ctx, mailboxId, [
    'owner',
    'admin',
    'sender',
  ]);
  if (!access) return null;
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_MAIL_ATTACHMENT_BYTES) {
    throw new Error('Attachment size is outside the allowed range');
  }
  const { data: draft, error: draftError } = await privateTable(
    access.admin,
    'mail_messages'
  )
    .select('id')
    .eq('id', draftId)
    .eq('mailbox_id', mailboxId)
    .eq('status', 'draft')
    .maybeSingle();
  if (draftError)
    throw new Error(`Failed to load draft: ${draftError.message}`);
  if (!draft) return null;

  const { data: existing, error: existingError } = await privateTable(
    access.admin,
    'mail_attachments'
  )
    .select('size_bytes')
    .eq('message_id', draftId)
    .limit(MAX_MAIL_ATTACHMENTS + 1);
  if (existingError)
    throw new Error(`Failed to inspect attachments: ${existingError.message}`);
  if ((existing ?? []).length >= MAX_MAIL_ATTACHMENTS) {
    throw new Error('Attachment count exceeds the allowed limit');
  }
  const totalBytes = (existing ?? []).reduce(
    (total: number, row: AnyRecord) => total + Number(row.size_bytes ?? 0),
    bytes.byteLength
  );
  if (totalBytes > MAX_MAIL_ATTACHMENT_BYTES) {
    throw new Error('Total attachment size exceeds the allowed limit');
  }

  const bucketName = getMailR2BucketName();
  const objectKey = `mail/drafts/${mailboxId}/${draftId}/${randomUUID()}`;
  const location: MailStoredObjectLocation = {
    bucketName,
    objectKey,
    provider: 'r2',
  };
  await putMailStoredObject({ bytes, contentType, location });

  let storedObjectId: string | null = null;
  try {
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const { data: storedObject, error: objectError } = await privateTable(
      access.admin,
      'mail_stored_objects'
    )
      .insert({
        bucket_name: bucketName,
        content_type: contentType,
        filename,
        mailbox_id: mailboxId,
        message_id: draftId,
        object_key: objectKey,
        object_kind: 'attachment',
        provider: 'r2',
        sha256,
        size_bytes: bytes.byteLength,
      })
      .select('*')
      .single();
    if (objectError) throw objectError;
    storedObjectId = storedObject.id;
    const { data: attachment, error: attachmentError } = await privateTable(
      access.admin,
      'mail_attachments'
    )
      .insert({
        content_type: contentType,
        disposition: 'attachment',
        filename,
        message_id: draftId,
        size_bytes: bytes.byteLength,
        stored_object_id: storedObject.id,
      })
      .select('*')
      .single();
    if (attachmentError) throw attachmentError;
    await privateTable(access.admin, 'mail_messages')
      .update({ has_attachments: true })
      .eq('id', draftId)
      .eq('mailbox_id', mailboxId);
    return attachment;
  } catch (error) {
    await deleteMailStoredObject(location).catch((cleanupError) => {
      console.error('[mail] failed to clean up attachment upload', {
        cleanupError,
      });
    });
    if (storedObjectId) {
      await privateTable(access.admin, 'mail_stored_objects')
        .delete()
        .eq('id', storedObjectId)
        .catch((cleanupError: unknown) => {
          console.error('[mail] failed to clean up attachment metadata', {
            cleanupError,
            storedObjectId,
          });
        });
    }
    throw error;
  }
}

export async function deleteDraftAttachment({
  attachmentId,
  ctx,
  draftId,
  mailboxId,
}: {
  attachmentId: string;
  ctx: MailRouteContext;
  draftId: string;
  mailboxId: string;
}) {
  const access = await requireMailboxAccess(ctx, mailboxId, [
    'owner',
    'admin',
    'sender',
  ]);
  if (!access) return false;
  const authorized = await getAuthorizedAttachment({
    attachmentId,
    ctx,
    mailboxId,
    messageId: draftId,
  });
  if (!authorized) return false;
  const { data: draft } = await privateTable(access.admin, 'mail_messages')
    .select('id')
    .eq('id', draftId)
    .eq('mailbox_id', mailboxId)
    .eq('status', 'draft')
    .maybeSingle();
  if (!draft) return false;

  await deleteMailStoredObject(authorized.location);
  const { error } = await privateTable(access.admin, 'mail_attachments')
    .delete()
    .eq('id', attachmentId)
    .eq('message_id', draftId);
  if (error) throw new Error(`Failed to delete attachment: ${error.message}`);
  if (authorized.attachment.stored_object_id) {
    await privateTable(access.admin, 'mail_stored_objects')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', authorized.attachment.stored_object_id);
  }
  const { count } = await privateTable(access.admin, 'mail_attachments')
    .select('id', { count: 'exact', head: true })
    .eq('message_id', draftId);
  await privateTable(access.admin, 'mail_messages')
    .update({ has_attachments: Boolean(count) })
    .eq('id', draftId);
  return true;
}

export async function loadOutboundAttachments(
  admin: AnyRecord,
  mailboxId: string,
  messageId: string
): Promise<EmailAttachment[]> {
  const { data, error } = await privateTable(admin, 'mail_attachments')
    .select('*')
    .eq('message_id', messageId)
    .limit(MAX_MAIL_ATTACHMENTS);
  if (error)
    throw new Error(`Failed to load outbound attachments: ${error.message}`);

  return Promise.all(
    (data ?? []).map(async (attachment: AnyRecord) => {
      let location: MailStoredObjectLocation;
      if (attachment.stored_object_id) {
        const { data: object, error: objectError } = await privateTable(
          admin,
          'mail_stored_objects'
        )
          .select('*')
          .eq('id', attachment.stored_object_id)
          .eq('mailbox_id', mailboxId)
          .eq('message_id', messageId)
          .is('deleted_at', null)
          .single();
        if (objectError)
          throw new Error(
            `Failed to load attachment object: ${objectError.message}`
          );
        location = r2Location(object);
      } else if (attachment.storage_bucket && attachment.storage_key) {
        location = {
          bucketName: attachment.storage_bucket,
          objectKey: attachment.storage_key,
          provider: 's3',
        };
      } else {
        throw new Error('Attachment does not have stored bytes');
      }
      return {
        contentType: attachment.content_type,
        data: await readMailStoredObject(location),
        filename: attachment.filename,
      };
    })
  );
}
