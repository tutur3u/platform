import { type NextRequest, NextResponse } from 'next/server';
import { listHiveAccessRequests } from '@/lib/hive/hive-db';
import {
  mapHiveAccessRequest,
  requireHiveAdmin,
  withHiveRoute,
} from '../_shared';

export async function GET(request: NextRequest) {
  return withHiveRoute(request, '/api/v1/hive/access-requests', async () => {
    const access = await requireHiveAdmin(request);

    if (!access.ok) {
      return access.response;
    }

    try {
      const requests = await listHiveAccessRequests({ status: 'pending' });
      return NextResponse.json({
        requests: requests.map(mapHiveAccessRequest),
      });
    } catch {
      return NextResponse.json(
        { error: 'Failed to list Hive access requests' },
        { status: 500 }
      );
    }
  });
}
