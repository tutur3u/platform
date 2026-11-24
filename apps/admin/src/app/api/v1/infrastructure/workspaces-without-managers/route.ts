import { connection, NextResponse } from 'next/server';
import { authorizeInfrastructureAdminRequest } from '@/lib/infrastructure-admin-access';
import {
  listWorkspacesWithoutMemberManager,
  parseWorkspaceManagerGapQuery,
} from '@/lib/workspace-manager-gaps';

export async function GET(request: Request) {
  await connection();
  const access = await authorizeInfrastructureAdminRequest(
    'manage_workspace_roles',
    true,
    request
  );
  if (!access.ok) return access.response;

  const { searchParams } = new URL(request.url);
  const parsed = parseWorkspaceManagerGapQuery({
    after: searchParams.get('after'),
    limit: searchParams.get('limit'),
  });
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const page = await listWorkspacesWithoutMemberManager(
    access.sbAdmin,
    parsed.query
  );
  if (!page.ok) {
    return NextResponse.json(
      { error: 'Failed to load workspaces' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    nextCursor: page.nextCursor,
    workspaces: page.rows,
  });
}
