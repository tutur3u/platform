import type { MailStoredObjectLocation } from '../storage';
import type { MailRouteContext } from '../types';
import { requireMailboxAccess } from './bootstrap';
import { mailMessageTable, privateTable } from './shared';

export async function getAuthorizedMailRawSource({
  ctx,
  mailboxId,
  messageId,
}: {
  ctx: MailRouteContext;
  mailboxId: string;
  messageId: string;
}): Promise<MailStoredObjectLocation | null> {
  const access = await requireMailboxAccess(ctx, mailboxId);
  if (!access) return null;
  const { data: message, error: messageError } = await mailMessageTable(
    access,
    ctx
  )
    .select('raw_message_id')
    .eq('id', messageId)
    .eq('mailbox_id', mailboxId)
    .maybeSingle();
  if (messageError) throw new Error('Failed to authorize message source');
  if (!message?.raw_message_id) return null;

  const { data: raw, error: rawError } = await privateTable(
    access.admin,
    'mail_raw_messages'
  )
    .select('stored_object_id, s3_bucket, s3_key')
    .eq('id', message.raw_message_id)
    .maybeSingle();
  if (rawError) throw new Error('Failed to load message source');
  if (!raw) return null;
  if (raw.stored_object_id) {
    const { data: object, error } = await privateTable(
      access.admin,
      'mail_stored_objects'
    )
      .select('provider, bucket_name, object_key')
      .eq('id', raw.stored_object_id)
      .eq('object_kind', 'raw_mime')
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new Error('Failed to load source object');
    if (!object || !['r2', 's3'].includes(object.provider)) return null;
    return {
      provider: object.provider,
      bucketName: object.bucket_name,
      objectKey: object.object_key,
    };
  }
  return raw.s3_bucket && raw.s3_key
    ? { provider: 's3', bucketName: raw.s3_bucket, objectKey: raw.s3_key }
    : null;
}
