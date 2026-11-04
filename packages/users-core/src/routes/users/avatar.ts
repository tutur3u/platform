import {
  ProfileUploadError,
  reserveWorkspaceManagedAvatarBudget,
} from '@tuturuuu/storage-core/profile-upload-budget';
import { DEFAULT_SIGNED_URL_TTL_SECONDS } from '@tuturuuu/storage-core/signed-url-policy';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import {
  isCanonicalAvatarWorkspaceId,
  isUserAvatarFilename,
  isUserAvatarPath,
} from './avatar-path';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

interface WorkspaceUserRouteActor {
  email?: string | null;
  id: string;
}

export async function handleGetAvatarRequest(
  req: Request,
  { params }: Params,
  actor?: WorkspaceUserRouteActor | null
) {
  const { wsId } = await params;
  const { searchParams } = new URL(req.url);
  const path = searchParams.get('path');

  if (!path) {
    return NextResponse.json({ message: 'path is required' }, { status: 400 });
  }

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req, user: actor });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!isUserAvatarPath(path, permissions.wsId)) {
    return NextResponse.json({ message: 'Invalid path' }, { status: 400 });
  }

  const sbAdmin = await createAdminClient();

  // Avatars uploaded through POST live in the public `avatars` bucket: return
  // their stable public URL, which carries no bearer token and is safe to
  // store. `signedUrl` keeps the field older clients (mobile CRM) persist.
  const separator = path.lastIndexOf('/');
  const folder = path.slice(0, separator);
  const fileName = path.slice(separator + 1);
  const { data: publicObjects, error: listError } = await sbAdmin.storage
    .from('avatars')
    .list(folder, { limit: 1, search: fileName });

  if (!listError && publicObjects?.some((item) => item.name === fileName)) {
    const { data: publicUrlData } = sbAdmin.storage
      .from('avatars')
      .getPublicUrl(path);
    return NextResponse.json({
      path,
      publicUrl: publicUrlData.publicUrl,
      signedUrl: publicUrlData.publicUrl,
    });
  }

  // Legacy avatars in the private `workspaces` bucket: sign on read with a
  // short lifetime. Callers must store the path, not this URL.
  const { data, error } = await sbAdmin.storage
    .from('workspaces')
    .createSignedUrl(path, DEFAULT_SIGNED_URL_TTL_SECONDS);

  if (error) {
    console.error(error);
    return NextResponse.json(
      { message: 'Error generating signed read URL' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ...data, path });
}

export async function handleCreateAvatarUploadRequest(
  req: Request,
  { params }: Params,
  actor?: WorkspaceUserRouteActor | null
) {
  const { wsId } = await params;

  // Contacts injects its verified satellite actor; Web resolves the request session.
  const session =
    actor === undefined
      ? await resolveAuthenticatedSessionUser(await createClient(req))
      : { user: actor, authError: null };
  const principal = session.authError ? null : session.user;
  if (!principal?.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const permissions = await getPermissions({
    wsId,
    request: req,
    user: principal,
  });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const { containsPermission } = permissions;
  if (!containsPermission('manage_users')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => null);
  const fileName = body?.fileName;
  const contentType = body?.contentType;

  if (
    !isCanonicalAvatarWorkspaceId(permissions.wsId) ||
    !isUserAvatarFilename(fileName) ||
    !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(
      contentType
    )
  ) {
    return NextResponse.json(
      { message: 'Invalid workspace, fileName or contentType' },
      { status: 400 }
    );
  }

  try {
    await reserveWorkspaceManagedAvatarBudget(permissions.wsId, principal.id);
  } catch (error) {
    if (error instanceof ProfileUploadError) {
      return NextResponse.json(
        {
          message: error.message,
          ...(error.status === 429 && {
            code: 'PROFILE_UPLOAD_LIMIT',
            retryAfter: error.retryAfter,
          }),
        },
        {
          status: error.status,
          headers: error.retryAfter
            ? { 'Retry-After': String(error.retryAfter) }
            : undefined,
        }
      );
    }
    return NextResponse.json(
      { message: 'Profile upload protection is unavailable' },
      { status: 503 }
    );
  }

  // Issue a privileged ticket only after charging the verified actor's ceilings.
  const sbAdmin = await createAdminClient();
  const filePath = `${permissions.wsId}/users/${fileName}`;

  const { data, error } = await sbAdmin.storage
    .from('avatars')
    .createSignedUploadUrl(filePath);

  if (error) {
    console.error(error);
    return NextResponse.json(
      { message: 'Error creating signed upload URL' },
      { status: 500 }
    );
  }

  const { data: publicUrlData } = sbAdmin.storage
    .from('avatars')
    .getPublicUrl(filePath);

  return NextResponse.json({
    ...data,
    publicUrl: publicUrlData.publicUrl,
  });
}

export async function GET(req: Request, context: Params) {
  return handleGetAvatarRequest(req, context);
}

export async function POST(req: Request, context: Params) {
  return handleCreateAvatarUploadRequest(req, context);
}
