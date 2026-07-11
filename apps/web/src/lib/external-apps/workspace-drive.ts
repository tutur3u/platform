import { posix } from 'node:path';
import {
  getBearerAppCoordinationToken,
  verifyAppCoordinationToken,
} from '@tuturuuu/auth/app-coordination';
import {
  createWorkspaceStorageSignedReadUrl,
  createWorkspaceStorageUploadPayload,
  deleteWorkspaceStorageObjectByPath,
  getWorkspaceStorageObjectMetadataForProvider,
  resolveWorkspaceStorageProvider,
  WorkspaceStorageError,
} from '@tuturuuu/storage-core/workspace-storage-provider';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  PERSONAL_WORKSPACE_SLUG,
  ROOT_WORKSPACE_ID,
  resolveWorkspaceId,
} from '@tuturuuu/utils/constants';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { validate as validateUUID } from 'uuid';
import { z } from 'zod';
import { getExternalAppById } from '@/lib/app-coordination/external-apps';

const DRIVE_READ_SCOPE = 'workspace:drive:read';
const DRIVE_WRITE_SCOPE = 'workspace:drive:write';
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const READ_URL_TTL_SECONDS = 15 * 60;
const MIME_TYPES = new Set([
  'application/csv',
  'application/json',
  'application/msword',
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/csv',
  'text/markdown',
  'text/plain',
]);

const uploadSchema = z.object({
  attachmentId: z.string().uuid(),
  contentType: z.string().trim().min(1).max(160),
  conversationId: z.string().uuid(),
  filename: z.string().trim().min(1).max(240),
  size: z.number().int().positive().max(MAX_FILE_BYTES),
});

const objectSchema = z.object({
  contentType: z.string().trim().min(1).max(160).optional(),
  path: z.string().trim().min(1).max(1024),
  provider: z.enum(['r2', 'supabase']).optional(),
  size: z.number().int().positive().max(MAX_FILE_BYTES).optional(),
});

type RequiredScope = typeof DRIVE_READ_SCOPE | typeof DRIVE_WRITE_SCOPE;
type AdminDb = TypedSupabaseClient;

export type ExternalAppWorkspaceDriveAccess = {
  admin: AdminDb;
  normalizedWorkspaceId: string;
  targetApp: string;
  user: { email: string | null; id: string };
};

function hasScope(scopes: string[], requiredScope: RequiredScope) {
  return (
    scopes.includes('*') ||
    scopes.includes(requiredScope) ||
    scopes.some(
      (scope) =>
        scope.endsWith(':*') && requiredScope.startsWith(scope.slice(0, -1))
    )
  );
}

function accessError(message: string, status: 400 | 401 | 403 | 500) {
  return {
    ok: false as const,
    response: NextResponse.json({ error: message }, { status }),
  };
}

async function normalizeWorkspaceIdForUser({
  admin,
  userId,
  wsId,
}: {
  admin: AdminDb;
  userId: string;
  wsId: string;
}) {
  const resolved = resolveWorkspaceId(wsId);
  if (resolved === ROOT_WORKSPACE_ID || validateUUID(resolved)) return resolved;

  if (resolved.toLowerCase() === PERSONAL_WORKSPACE_SLUG) {
    const { data, error } = await admin
      .from('workspaces')
      .select('id, workspace_members!inner(user_id, type)')
      .eq('personal', true)
      .eq('workspace_members.user_id', userId)
      .eq('workspace_members.type', 'MEMBER')
      .maybeSingle();
    if (error || !data?.id) throw new Error('Workspace not found');
    return data.id;
  }

  const handle = resolved.trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/u.test(handle)) {
    throw new Error('Invalid workspace');
  }
  const { data } = await admin
    .from('workspaces')
    .select('id')
    .eq('handle', handle)
    .maybeSingle();
  if (!data?.id) throw new Error('Workspace not found');
  return data.id;
}

export async function requireExternalAppWorkspaceDriveAccess({
  request,
  requiredScopes,
  wsId,
}: {
  request: Request;
  requiredScopes: RequiredScope[];
  wsId: string;
}) {
  const token = getBearerAppCoordinationToken(request);
  if (!token) return accessError('Unauthorized', 401);
  const verification = verifyAppCoordinationToken(token);
  if (!verification.ok) return accessError('Unauthorized', 401);
  if (
    requiredScopes.some((scope) => !hasScope(verification.claims.scopes, scope))
  ) {
    return accessError('Requested scope is not allowed for this app', 403);
  }

  const admin = (await createAdminClient()) as AdminDb;
  const app = await getExternalAppById(verification.claims.target_app, admin);
  if (!app?.enabled) return accessError('Forbidden', 403);

  let normalizedWorkspaceId: string;
  try {
    normalizedWorkspaceId = await normalizeWorkspaceIdForUser({
      admin,
      userId: verification.claims.sub,
      wsId,
    });
  } catch {
    return accessError('Forbidden', 403);
  }

  if (!app.allowedWorkspaceIds.includes(normalizedWorkspaceId.toLowerCase())) {
    return accessError('App is not linked to this workspace', 403);
  }

  const membership = await verifyWorkspaceMembershipType({
    requiredType: 'MEMBER',
    supabase: admin,
    userId: verification.claims.sub,
    wsId: normalizedWorkspaceId,
  });
  if (membership.error === 'membership_lookup_failed') {
    return accessError('Failed to verify workspace membership', 500);
  }
  if (!membership.ok) return accessError('Forbidden', 403);

  return {
    admin,
    normalizedWorkspaceId,
    ok: true as const,
    targetApp: app.id,
    user: { email: verification.claims.email, id: verification.claims.sub },
  };
}

function assertSupportedType(contentType: string) {
  const normalized = contentType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  if (!MIME_TYPES.has(normalized)) {
    throw new WorkspaceStorageError('Unsupported attachment type', 415);
  }
  return normalized;
}

export function isExternalAppChatDrivePath(targetApp: string, path: string) {
  const normalized = posix.normalize(path);
  const prefix = `external-apps/${targetApp}/chat/`;
  return (
    normalized === path &&
    path.startsWith(prefix) &&
    !path.includes('..') &&
    path.split('/').length === 6 &&
    validateUUID(path.split('/')[3] ?? '') &&
    validateUUID(path.split('/')[4] ?? '') &&
    Boolean(path.split('/')[5])
  );
}

function assertOwnedPath(
  access: ExternalAppWorkspaceDriveAccess,
  path: string
) {
  if (!isExternalAppChatDrivePath(access.targetApp, path)) {
    throw new WorkspaceStorageError('Invalid external app Drive path', 400);
  }
}

export async function createExternalAppChatUpload(
  access: ExternalAppWorkspaceDriveAccess,
  payload: unknown
) {
  const input = uploadSchema.parse(payload);
  const contentType = assertSupportedType(input.contentType);
  const path = `external-apps/${access.targetApp}/chat/${input.conversationId}/${input.attachmentId}`;
  const upload = await createWorkspaceStorageUploadPayload(
    access.normalizedWorkspaceId,
    input.filename,
    { contentType, path, size: input.size, upsert: false }
  );
  return { ...upload, expiresIn: 900 };
}

export async function finalizeExternalAppChatUpload(
  access: ExternalAppWorkspaceDriveAccess,
  payload: unknown
) {
  const input = objectSchema
    .required({ contentType: true, size: true })
    .parse(payload);
  assertOwnedPath(access, input.path);
  const expectedType = assertSupportedType(input.contentType);
  const provider =
    input.provider ??
    (await resolveWorkspaceStorageProvider(access.normalizedWorkspaceId))
      .provider;
  const metadata = await getWorkspaceStorageObjectMetadataForProvider(
    access.normalizedWorkspaceId,
    provider,
    input.path
  );
  const actualType = metadata.contentType
    ?.split(';', 1)[0]
    ?.trim()
    .toLowerCase();
  if (
    metadata.size !== input.size ||
    (actualType && actualType !== expectedType)
  ) {
    await deleteWorkspaceStorageObjectByPath(
      access.normalizedWorkspaceId,
      input.path
    );
    throw new WorkspaceStorageError(
      'Stored attachment metadata does not match the upload request',
      400
    );
  }
  return {
    contentType: actualType ?? expectedType,
    fullPath: metadata.fullPath,
    path: metadata.path,
    provider,
    size: metadata.size,
  };
}

export async function createExternalAppChatReadUrl(
  access: ExternalAppWorkspaceDriveAccess,
  payload: unknown
) {
  const input = objectSchema
    .pick({ path: true, provider: true })
    .parse(payload);
  assertOwnedPath(access, input.path);
  const provider =
    input.provider ??
    (await resolveWorkspaceStorageProvider(access.normalizedWorkspaceId))
      .provider;
  const signedUrl = await createWorkspaceStorageSignedReadUrl(
    access.normalizedWorkspaceId,
    input.path,
    { expiresIn: READ_URL_TTL_SECONDS, provider, requireExists: true }
  );
  return { expiresIn: READ_URL_TTL_SECONDS, provider, signedUrl };
}

export async function deleteExternalAppChatObject(
  access: ExternalAppWorkspaceDriveAccess,
  payload: unknown
) {
  const input = objectSchema.pick({ path: true }).parse(payload);
  assertOwnedPath(access, input.path);
  const result = await deleteWorkspaceStorageObjectByPath(
    access.normalizedWorkspaceId,
    input.path
  );
  return { deleted: true, provider: result.provider };
}

export async function handleExternalAppWorkspaceDriveRoute({
  handler,
  request,
  requiredScopes,
  wsId,
}: {
  handler: (access: ExternalAppWorkspaceDriveAccess) => Promise<Response>;
  request: Request;
  requiredScopes: RequiredScope[];
  wsId: string;
}) {
  const access = await requireExternalAppWorkspaceDriveAccess({
    request,
    requiredScopes,
    wsId,
  });
  if (!access.ok) return access.response;
  try {
    return await handler(access);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Malformed JSON request' },
        { status: 400 }
      );
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', issues: error.issues },
        { status: 400 }
      );
    }
    if (error instanceof WorkspaceStorageError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error('External app Drive request failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      targetApp: access.targetApp,
      workspaceId: access.normalizedWorkspaceId,
    });
    return NextResponse.json(
      { error: 'External app Drive request failed' },
      { status: 500 }
    );
  }
}

export const externalAppWorkspaceDriveScopes = {
  driveRead: DRIVE_READ_SCOPE,
  driveWrite: DRIVE_WRITE_SCOPE,
} as const;
