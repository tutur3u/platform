import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
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
  const permissions = await getPermissions({ wsId, request: req });
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

export async function POST(req: Request, { params }: Params) {
  const { wsId } = await params;

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
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

  // Use admin client to create signed upload URL
  const sbAdmin = await createAdminClient();
  const filePath = `${wsId}/users/${fileName}`;

  const { data, error } = await sbAdmin.storage
    .from('workspaces')
    .createSignedUploadUrl(filePath);

  if (error) {
    console.error(error);
    return NextResponse.json(
      { message: 'Error creating signed upload URL' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}
