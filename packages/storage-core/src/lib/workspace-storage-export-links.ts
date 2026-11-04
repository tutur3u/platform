import 'server-only';

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { posix } from 'node:path';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';
import { sanitizePath } from '@tuturuuu/utils/storage-path';
import { WorkspaceStorageError } from './storage-download-error';
import type { WorkspaceStorageProvider } from './workspace-storage-config';
import {
  getOrCreateExportRevocationVersion,
  readExportRevocationVersion,
  revokeExportFolder,
} from './workspace-storage-export-revocation';

const EXPORT_LINK_VERSION = 2;
const DEFAULT_EXPORT_LINK_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_EXPORT_LINK_TTL_SECONDS = 30 * 24 * 60 * 60;

function exportLinkTtlSeconds() {
  const configured = Number(process.env.DRIVE_EXPORT_LINK_TTL_SECONDS);
  return Number.isFinite(configured) && configured >= 1
    ? Math.min(Math.floor(configured), MAX_EXPORT_LINK_TTL_SECONDS)
    : DEFAULT_EXPORT_LINK_TTL_SECONDS;
}

export async function revokeWorkspaceStorageExportLinks(input: {
  wsId: string;
  folderPath: string;
}) {
  const folderPath = sanitizePath(input.folderPath);
  if (!folderPath) {
    throw new WorkspaceStorageError('Invalid export folder path.', 400);
  }
  await revokeExportFolder(input.wsId, folderPath);
}

function encodeBase64Url(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function getExportSigningSecret() {
  const secret =
    process.env.DRIVE_EXPORT_SIGNING_SECRET?.trim() ||
    (DEV_MODE ? 'dev-drive-export-links-secret' : '');

  if (!secret) {
    throw new WorkspaceStorageError(
      'Drive export links are unavailable because the signing secret is missing.',
      500
    );
  }

  return secret;
}

function signPayload(payload: string) {
  return createHmac('sha256', getExportSigningSecret())
    .update(payload)
    .digest('base64url');
}

function resolveConfiguredOrigin(value?: string) {
  if (!value) {
    return null;
  }

  try {
    const [firstValue] = value
      .split(/[,\n]/u)
      .map((entry) => entry.trim())
      .filter(Boolean);

    if (!firstValue) {
      return null;
    }

    const normalized = /^[a-z]+:\/\//iu.test(firstValue)
      ? firstValue
      : `https://${firstValue}`;

    return new URL(normalized).origin;
  } catch {
    return null;
  }
}

export function resolveWorkspaceStorageExportOrigin() {
  const origin =
    resolveConfiguredOrigin(process.env.WEB_APP_URL) ||
    resolveConfiguredOrigin(process.env.NEXT_PUBLIC_WEB_APP_URL) ||
    resolveConfiguredOrigin(process.env.NEXT_PUBLIC_APP_URL) ||
    resolveConfiguredOrigin(process.env.COOLIFY_URL) ||
    resolveConfiguredOrigin(process.env.COOLIFY_FQDN) ||
    (DEV_MODE
      ? getLocalInternalAppUrl('platform', 'http://localhost:7803')
      : null);

  if (!origin) {
    throw new WorkspaceStorageError(
      'Drive export links are unavailable because WEB_APP_URL, NEXT_PUBLIC_WEB_APP_URL, NEXT_PUBLIC_APP_URL, and Coolify URL fallbacks are missing.',
      500
    );
  }

  return origin;
}

export async function createWorkspaceStorageExportToken(input: {
  wsId: string;
  provider: WorkspaceStorageProvider;
  folderPath: string;
}) {
  const sanitizedFolderPath = sanitizePath(input.folderPath);

  if (!sanitizedFolderPath) {
    throw new WorkspaceStorageError('Invalid export folder path.', 400);
  }

  const revocationVersion = await getOrCreateExportRevocationVersion(
    input.wsId,
    sanitizedFolderPath
  );
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = {
    v: EXPORT_LINK_VERSION,
    wsId: input.wsId,
    provider: input.provider,
    folderPath: sanitizedFolderPath,
    iat: issuedAt,
    exp: issuedAt + exportLinkTtlSeconds(),
    revocationVersion,
    nonce: randomUUID(),
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export async function verifyWorkspaceStorageExportToken(
  token: string
): Promise<{
  expiresAt: number;
  wsId: string;
  provider: WorkspaceStorageProvider;
  folderPath: string;
}> {
  const [encodedPayload, signature, extra] = token.split('.');

  if (!encodedPayload || !signature || extra !== undefined) {
    throw new WorkspaceStorageError('Invalid export token.', 404);
  }

  const expectedSignature = signPayload(encodedPayload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    throw new WorkspaceStorageError('Invalid export token.', 404);
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(decodeBase64Url(encodedPayload));
  } catch {
    throw new WorkspaceStorageError('Invalid export token.', 404);
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('v' in parsed) ||
    parsed.v !== EXPORT_LINK_VERSION ||
    !('wsId' in parsed) ||
    typeof parsed.wsId !== 'string' ||
    !('provider' in parsed) ||
    (parsed.provider !== 'supabase' && parsed.provider !== 'r2') ||
    !('folderPath' in parsed) ||
    typeof parsed.folderPath !== 'string' ||
    !('iat' in parsed) ||
    typeof parsed.iat !== 'number' ||
    !('nonce' in parsed) ||
    typeof parsed.nonce !== 'string' ||
    !('exp' in parsed) ||
    typeof parsed.exp !== 'number' ||
    !Number.isSafeInteger(parsed.iat) ||
    !Number.isSafeInteger(parsed.exp) ||
    parsed.exp <= parsed.iat ||
    parsed.exp - parsed.iat > MAX_EXPORT_LINK_TTL_SECONDS ||
    !('revocationVersion' in parsed) ||
    typeof parsed.revocationVersion !== 'string'
  ) {
    throw new WorkspaceStorageError('Invalid export token.', 404);
  }

  const now = Math.floor(Date.now() / 1000);
  if (parsed.iat > now) {
    throw new WorkspaceStorageError('Invalid export token.', 404);
  }
  if (now >= parsed.exp) {
    throw new WorkspaceStorageError('Export link expired.', 410);
  }

  const sanitizedFolderPath = sanitizePath(parsed.folderPath);

  if (!sanitizedFolderPath) {
    throw new WorkspaceStorageError('Invalid export folder path.', 404);
  }

  if (
    parsed.revocationVersion !==
    (await readExportRevocationVersion(parsed.wsId, sanitizedFolderPath))
  ) {
    throw new WorkspaceStorageError('Export link revoked.', 410);
  }

  return {
    expiresAt: parsed.exp,
    wsId: parsed.wsId,
    provider: parsed.provider,
    folderPath: sanitizedFolderPath,
  };
}

export function createWorkspaceStorageExportAssetUrl(input: {
  wsId: string;
  token: string;
  relativePath: string;
}) {
  const relativePath = sanitizePath(input.relativePath);

  if (!relativePath) {
    throw new WorkspaceStorageError('Invalid export asset path.', 400);
  }

  const encodedSegments = relativePath
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  return `${resolveWorkspaceStorageExportOrigin()}/api/v1/workspaces/${encodeURIComponent(input.wsId)}/storage/export/${encodeURIComponent(input.token)}/${encodedSegments}`;
}

export function resolveWorkspaceStorageExportAssetPath(input: {
  folderPath: string;
  assetPathSegments: string[];
}) {
  const relativePath = input.assetPathSegments.join('/');

  if (!relativePath) {
    throw new WorkspaceStorageError('Missing export asset path.', 400);
  }

  const joinedPath = posix.join(input.folderPath, relativePath);
  const sanitizedPath = sanitizePath(joinedPath);

  if (!sanitizedPath) {
    throw new WorkspaceStorageError('Invalid export asset path.', 400);
  }

  if (
    sanitizedPath !== input.folderPath &&
    !sanitizedPath.startsWith(`${input.folderPath}/`)
  ) {
    throw new WorkspaceStorageError('Invalid export asset path.', 403);
  }

  return sanitizedPath;
}
