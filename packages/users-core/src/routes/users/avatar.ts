import {
  ProfileUploadError,
  reserveProfileUploadBudget,
} from '@tuturuuu/storage-core/profile-upload-budget';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

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

  // Ensure the path is within the workspace's user avatars directory
  if (!path.startsWith(`${wsId}/users/`)) {
    return NextResponse.json({ message: 'Invalid path' }, { status: 400 });
  }

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req, user: actor });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const sbAdmin = await createAdminClient();

  const { data, error } = await sbAdmin.storage
    .from('workspaces')
    .createSignedUrl(path, 60 * 60 * 24 * 365); // 1 year

  if (error) {
    console.error(error);
    return NextResponse.json(
      { message: 'Error generating signed read URL' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
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

  const { fileName, contentType } = await req.json();

  if (!fileName || !contentType) {
    return NextResponse.json(
      { message: 'fileName and contentType are required' },
      { status: 400 }
    );
  }

  try {
    await reserveProfileUploadBudget(principal.id, 'avatar');
  } catch (error) {
    if (error instanceof ProfileUploadError) {
      return NextResponse.json(
        { message: error.message },
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
  const filePath = `${wsId}/users/${fileName}`;

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
