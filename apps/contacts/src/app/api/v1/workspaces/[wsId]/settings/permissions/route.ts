import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

type RouteContext = { params: Promise<{ wsId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const user = await getSatelliteAppSessionUser('contacts');
  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { wsId } = await params;
  const permissions = await getPermissions({ user, wsId });
  if (!permissions) {
    return NextResponse.json(
      { message: 'Workspace access denied' },
      { status: 403 }
    );
  }

  return NextResponse.json(
    {
      manage_workspace_settings: permissions.containsPermission(
        'manage_workspace_settings'
      ),
    },
    {
      headers: {
        'Cache-Control': 'private, max-age=30, stale-while-revalidate=30',
      },
    }
  );
}
