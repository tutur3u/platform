import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { posix } from 'node:path';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import { sanitizePath } from '@tuturuuu/utils/storage-path';
import { WorkspaceStorageError } from './workspace-storage-provider';

const EXPORT_LINK_VERSION = 1;

interface WorkspaceStorageExportTokenPayload {
  v: number;
  wsId: string;
  folderPath: string;
}

function encodeBase64Url(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function getExportSigningSecret() {
  const secret =
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    process.env.VERCEL_CRON_SECRET?.trim() ||
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
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function resolveWorkspaceStorageExportOrigin() {
  return (
    resolveConfiguredOrigin(process.env.WEB_APP_URL) ||
    resolveConfiguredOrigin(process.env.NEXT_PUBLIC_WEB_APP_URL) ||
    resolveConfiguredOrigin(process.env.NEXT_PUBLIC_APP_URL) ||
    (DEV_MODE ? 'http://localhost:7803' : 'https://tuturuuu.com')
  );
}

export function createWorkspaceStorageExportToken(input: {
  wsId: string;
  folderPath: string;
}) {
  const sanitizedFolderPath = sanitizePath(input.folderPath);

  if (!sanitizedFolderPath) {
    throw new WorkspaceStorageError('Invalid export folder path.', 400);
  }

  const payload: WorkspaceStorageExportTokenPayload = {
    v: EXPORT_LINK_VERSION,
    wsId: input.wsId,
    folderPath: sanitizedFolderPath,
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export function verifyWorkspaceStorageExportToken(token: string) {
  const [encodedPayload, signature] = token.split('.');

  if (!encodedPayload || !signature) {
    throw new WorkspaceStorageError('Invalid export token.', 401);
  }

  const expectedSignature = signPayload(encodedPayload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    throw new WorkspaceStorageError('Invalid export token.', 401);
  }

  let parsed: WorkspaceStorageExportTokenPayload;

  try {
    parsed = JSON.parse(
      decodeBase64Url(encodedPayload)
    ) as WorkspaceStorageExportTokenPayload;
  } catch {
    throw new WorkspaceStorageError('Invalid export token.', 401);
  }

  if (
    parsed.v !== EXPORT_LINK_VERSION ||
    typeof parsed.wsId !== 'string' ||
    typeof parsed.folderPath !== 'string'
  ) {
    throw new WorkspaceStorageError('Invalid export token.', 401);
  }

  const sanitizedFolderPath = sanitizePath(parsed.folderPath);

  if (!sanitizedFolderPath) {
    throw new WorkspaceStorageError('Invalid export folder path.', 401);
  }

  return {
    wsId: parsed.wsId,
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
