import { createHash } from 'node:crypto';
import { Resolver } from 'node:dns/promises';
import { dkimVerify } from 'mailauth/lib/dkim/verify';
import { type AnyRecord, privateTable } from '../repository/shared';
import { readMailStoredObject } from '../storage';

export async function authenticateGroupSender(
  admin: AnyRecord,
  rawMessageId: string,
  sender: string
) {
  const { data: raw, error } = await privateTable(admin, 'mail_raw_messages')
    .select('stored_object_id,s3_bucket,s3_key,sha256')
    .eq('id', rawMessageId)
    .single();
  if (error) throw error;
  let location: Parameters<typeof readMailStoredObject>[0];
  if (raw.stored_object_id) {
    const { data: object, error: objectError } = await privateTable(
      admin,
      'mail_stored_objects'
    )
      .select('provider,bucket_name,object_key')
      .eq('id', raw.stored_object_id)
      .is('deleted_at', null)
      .single();
    if (objectError) throw objectError;
    location = {
      provider: object.provider,
      bucketName: object.bucket_name,
      objectKey: object.object_key,
    };
  } else {
    location = {
      provider: 's3' as const,
      bucketName: raw.s3_bucket,
      objectKey: raw.s3_key,
    };
  }
  const bytes = await readMailStoredObject(location);
  if (bytes.byteLength > 25 * 1024 * 1024)
    throw new Error('Group message exceeds size limit');
  if (createHash('sha256').update(bytes).digest('hex') !== raw.sha256)
    throw new Error('Group raw message hash mismatch');
  return verifyRawGroupSender(Buffer.from(bytes), sender);
}

export async function verifyRawGroupSender(
  bytes: Buffer,
  sender: string,
  resolveTxt = (name: string) =>
    new Resolver({ timeout: 3000, tries: 2 }).resolveTxt(name)
) {
  // Verify the raw message ourselves. Never trust sender-supplied Authentication-Results.
  const result = await dkimVerify(bytes, { resolver: resolveTxt });
  if (
    result.headerFrom.length !== 1 ||
    result.headerFrom[0]?.toLowerCase() !== sender.toLowerCase()
  )
    return false;
  const domain = sender.split('@')[1]?.toLowerCase();
  if (
    result.results.some(
      (signature) =>
        signature.status.result === 'pass' &&
        signature.signingDomain?.toLowerCase() === domain &&
        !signature.canonBodyLengthLimited &&
        signature.signatureTimeValid !== false
    )
  )
    return true;
  if (
    result.results.some((signature) => signature.status.result === 'temperror')
  ) {
    throw new Error('Temporary DNS failure verifying group sender');
  }
  return false;
}
