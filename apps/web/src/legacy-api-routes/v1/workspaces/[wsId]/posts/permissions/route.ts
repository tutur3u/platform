import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(req: Request, { params }: Params) {
  const { wsId } = await params;

  const [permissions, rootPermissions] = await Promise.all([
    getPermissions({ request: req, wsId }),
    getPermissions({ request: req, wsId: ROOT_WORKSPACE_ID }),
  ]);

  return NextResponse.json({
    canApprovePosts: permissions?.containsPermission('approve_posts') ?? false,
    canForceSendPosts:
      rootPermissions?.containsPermission('manage_workspace_roles') ?? false,
  });
}
