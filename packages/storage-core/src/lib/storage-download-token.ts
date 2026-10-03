import 'server-only';

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { WorkspaceStorageError } from './storage-download-error';

export interface StorageDownloadTicket {
  url: string;
  wsId: string;
  issuedAt: number;
  expiresAt: number;
}

export class StorageDownloadError extends WorkspaceStorageError {
  constructor(
    message: string,
    status: number,
    public readonly retryAfter?: number
  ) {
    super(message, status);
  }
}

function encryptionKey() {
  const secret =
    process.env.STORAGE_DOWNLOAD_SIGNING_SECRET ||
    process.env.SUPABASE_SECRET_KEY;
  if (!secret) {
    throw new StorageDownloadError('Storage downloads are unavailable', 503);
  }
  return createHash('sha256')
    .update(`tuturuuu:storage-download:v1:${secret}`)
    .digest();
}

export function validateStorageDownloadUrl(value: string, wsId: string) {
  const url = new URL(value);
  const origins = [
    process.env.SUPABASE_SERVER_URL,
    process.env[`${'NEXT_PUBLIC'}_SUPABASE_URL`],
  ]
    .filter(Boolean)
    .map((origin) => new URL(origin as string).origin);
  const pathname = decodeURIComponent(url.pathname);
  const prefixes = [
    `/storage/v1/object/sign/workspaces/${wsId}/`,
    `/storage/v1/render/image/sign/workspaces/${wsId}/`,
  ];
  if (
    !wsId ||
    wsId.includes('/') ||
    !origins.includes(url.origin) ||
    url.username ||
    url.password ||
    !prefixes.some((prefix) => pathname.startsWith(prefix)) ||
    pathname.split('/').some((part) => part === '..' || part === '.')
  ) {
    throw new StorageDownloadError('Invalid download ticket', 401);
  }
  return url;
}

function downloadOrigin() {
  const value =
    process.env.WEB_APP_URL ||
    process.env[`${'NEXT_PUBLIC'}_WEB_APP_URL`] ||
    process.env[`${'NEXT_PUBLIC'}_APP_URL`];
  if (!value) {
    throw new StorageDownloadError('Storage downloads are unavailable', 503);
  }
  const url = new URL(value);
  if (url.protocol !== 'https:' && process.env.NODE_ENV !== 'development') {
    throw new StorageDownloadError('Storage downloads are unavailable', 503);
  }
  return url.origin;
}

export function createStorageDownloadUrl(
  url: string,
  wsId: string,
  expiresIn: number
) {
  validateStorageDownloadUrl(url, wsId);
  if (!Number.isSafeInteger(expiresIn) || expiresIn < 1) {
    throw new StorageDownloadError('Invalid download expiry', 400);
  }
  const issuedAt = Math.floor(Date.now() / 1000);
  const ticket: StorageDownloadTicket = {
    url,
    wsId,
    issuedAt,
    expiresAt: issuedAt + expiresIn,
  };
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(Buffer.from('tuturuuu:storage-download:v1'));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(ticket), 'utf8'),
    cipher.final(),
  ]);
  const token = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
    'base64url'
  );
  return `${downloadOrigin()}/api/v1/storage/guarded-download/${token}`;
}

export function readStorageDownloadTicket(
  token: string
): StorageDownloadTicket {
  try {
    if (token.length > 8192 || !/^[A-Za-z0-9_-]+$/u.test(token)) {
      throw new Error('Invalid encoding');
    }
    const bytes = Buffer.from(token, 'base64url');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      encryptionKey(),
      bytes.subarray(0, 12)
    );
    decipher.setAAD(Buffer.from('tuturuuu:storage-download:v1'));
    decipher.setAuthTag(bytes.subarray(12, 28));
    const ticket = JSON.parse(
      Buffer.concat([
        decipher.update(bytes.subarray(28)),
        decipher.final(),
      ]).toString('utf8')
    ) as StorageDownloadTicket;
    const now = Math.floor(Date.now() / 1000);
    const revokedBefore = Number(
      process.env.STORAGE_DOWNLOAD_REVOKED_BEFORE || 0
    );
    if (
      typeof ticket.url !== 'string' ||
      typeof ticket.wsId !== 'string' ||
      !Number.isSafeInteger(ticket.issuedAt) ||
      !Number.isSafeInteger(ticket.expiresAt) ||
      ticket.issuedAt > now ||
      ticket.expiresAt <= now ||
      ticket.expiresAt <= ticket.issuedAt ||
      !Number.isSafeInteger(revokedBefore) ||
      ticket.issuedAt <= revokedBefore
    ) {
      throw new Error('Invalid or expired ticket');
    }
    validateStorageDownloadUrl(ticket.url, ticket.wsId);
    return ticket;
  } catch (error) {
    if (error instanceof StorageDownloadError && error.status === 503) {
      throw error;
    }
    throw new StorageDownloadError('Invalid or expired download ticket', 401);
  }
}
