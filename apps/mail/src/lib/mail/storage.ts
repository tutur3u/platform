import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

export type MailStoredObjectLocation = {
  bucketName: string;
  objectKey: string;
  provider: 'r2' | 's3';
};

export class MailStorageConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MailStorageConfigurationError';
  }
}

function r2Client() {
  const accountId = process.env.MAIL_R2_ACCOUNT_ID;
  const accessKeyId = process.env.MAIL_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.MAIL_R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new MailStorageConfigurationError(
      'R2 mail storage is not configured'
    );
  }
  return new S3Client({
    credentials: { accessKeyId, secretAccessKey },
    endpoint:
      process.env.MAIL_R2_ENDPOINT ??
      `https://${accountId}.r2.cloudflarestorage.com`,
    region: 'auto',
  });
}

function legacyS3Client() {
  return new S3Client({
    region: process.env.MAIL_SES_REGION || process.env.AWS_REGION,
  });
}

function clientFor(provider: MailStoredObjectLocation['provider']) {
  return provider === 'r2' ? r2Client() : legacyS3Client();
}

export function getMailR2BucketName() {
  const bucketName =
    process.env.MAIL_R2_BUCKET_NAME ?? process.env.MAIL_R2_BUCKET;
  if (!bucketName) {
    throw new MailStorageConfigurationError('R2 mail bucket is not configured');
  }
  return bucketName;
}

export async function putMailStoredObject({
  bytes,
  contentType,
  location,
}: {
  bytes: Uint8Array;
  contentType: string;
  location: MailStoredObjectLocation;
}) {
  await clientFor(location.provider).send(
    new PutObjectCommand({
      Body: bytes,
      Bucket: location.bucketName,
      ContentType: contentType,
      Key: location.objectKey,
    })
  );
}

export async function deleteMailStoredObject(
  location: MailStoredObjectLocation
) {
  await clientFor(location.provider).send(
    new DeleteObjectCommand({
      Bucket: location.bucketName,
      Key: location.objectKey,
    })
  );
}

export async function readMailStoredObject(location: MailStoredObjectLocation) {
  const response = await clientFor(location.provider).send(
    new GetObjectCommand({
      Bucket: location.bucketName,
      Key: location.objectKey,
    })
  );
  if (!response.Body) throw new Error('Mail object body is empty');
  return new Uint8Array(await response.Body.transformToByteArray());
}

export async function streamMailStoredObject({
  location,
  range,
}: {
  location: MailStoredObjectLocation;
  range?: string;
}) {
  const response = await clientFor(location.provider).send(
    new GetObjectCommand({
      Bucket: location.bucketName,
      Key: location.objectKey,
      Range: range,
    })
  );
  if (!response.Body) throw new Error('Mail object body is empty');
  return {
    body: response.Body.transformToWebStream(),
    contentLength: response.ContentLength,
    contentRange: response.ContentRange,
    contentType: response.ContentType,
    etag: response.ETag,
  };
}
