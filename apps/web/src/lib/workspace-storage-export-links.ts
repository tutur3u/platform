import 'server-only';

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { posix } from 'node:path';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import { sanitizePath } from '@tuturuuu/utils/storage-path';
import type { WorkspaceStorageProvider } from './workspace-storage-config';
import { WorkspaceStorageError } from './workspace-storage-provider';

const EXPORT_LINK_VERSION = 1;
const EXPORT_LINK_TTL_SECONDS = Number(
  process.env.DRIVE_EXPORT_LINK_TTL_SECONDS || 0
);

interface WorkspaceStorageExportTokenPayload {
  v: number;
  wsId: string;
  provider: WorkspaceStorageProvider;
  folderPath: string;
  iat: number;
  nonce: string;
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
    (DEV_MODE ? 'http://localhost:7803' : null);

  if (!origin) {
    throw new WorkspaceStorageError(
      'Drive export links are unavailable because WEB_APP_URL, NEXT_PUBLIC_WEB_APP_URL, NEXT_PUBLIC_APP_URL, and Coolify URL fallbacks are missing.',
      500
    );
  }

  return origin;
}

export function createWorkspaceStorageExportToken(input: {
  wsId: string;
  provider: WorkspaceStorageProvider;
  folderPath: string;
}) {
  const sanitizedFolderPath = sanitizePath(input.folderPath);

  if (!sanitizedFolderPath) {
    throw new WorkspaceStorageError('Invalid export folder path.', 400);
  }

  const payload: WorkspaceStorageExportTokenPayload = {
    v: EXPORT_LINK_VERSION,
    wsId: input.wsId,
    provider: input.provider,
    folderPath: sanitizedFolderPath,
    iat: Math.floor(Date.now() / 1000),
    nonce: randomUUID(),
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
    (parsed.provider !== 'supabase' && parsed.provider !== 'r2') ||
    typeof parsed.folderPath !== 'string' ||
    typeof parsed.iat !== 'number' ||
    typeof parsed.nonce !== 'string'
  ) {
    throw new WorkspaceStorageError('Invalid export token.', 401);
  }

  if (EXPORT_LINK_TTL_SECONDS > 0) {
    const now = Math.floor(Date.now() / 1000);
    if (now - parsed.iat > EXPORT_LINK_TTL_SECONDS) {
      throw new WorkspaceStorageError('Export link expired.', 401);
    }
  }

  const sanitizedFolderPath = sanitizePath(parsed.folderPath);

  if (!sanitizedFolderPath) {
    throw new WorkspaceStorageError('Invalid export folder path.', 401);
  }

  return {
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
