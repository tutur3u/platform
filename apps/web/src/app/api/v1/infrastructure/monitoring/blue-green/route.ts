import type { BlueGreenMonitoringSnapshot } from '@tuturuuu/internal-api/infrastructure';
import { createClient } from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { readBlueGreenMonitoringSnapshot } from '@/lib/infrastructure/blue-green-monitoring';

async function authorizeInfrastructureViewer(request: Request) {
  const supabase = await createClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    };
  }

  const permissions = await getPermissions({
    wsId: ROOT_WORKSPACE_ID,
    request,
  });

  if (!permissions || permissions.withoutPermission('view_infrastructure')) {
    return {
      ok: false as const,
      response: NextResponse.json({ message: 'Forbidden' }, { status: 403 }),
    };
  }

  return { ok: true as const };
}

export async function GET(request: Request) {
  const authorization = await authorizeInfrastructureViewer(request);
  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    const snapshot: BlueGreenMonitoringSnapshot =
      readBlueGreenMonitoringSnapshot();

    return NextResponse.json(snapshot);
  } catch (error) {
    console.error('Failed to load blue-green monitoring snapshot:', error);
    return NextResponse.json(
      { message: 'Failed to load blue-green monitoring snapshot' },
      { status: 500 }
    );
  }
}
