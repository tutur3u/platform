import { type NextRequest, NextResponse } from 'next/server';
import { runHiveSimulationTick } from '@/lib/hive/simulation';
import { requireHiveAdmin, withHiveRoute } from '../../../_shared';

type Params = {
  params: Promise<{ serverId: string }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  const { serverId } = await params;
  const route = `/api/v1/hive/servers/${serverId}/simulate`;

  return withHiveRoute(request, route, async () => {
    const access = await requireHiveAdmin(request);
    if (!access.ok) return access.response;

    const results = await runHiveSimulationTick({ force: true, serverId });
    const result = results[0];

    if (!result) {
      return NextResponse.json(
        { error: 'Hive server not found or disabled' },
        { status: 404 }
      );
    }

    return NextResponse.json({ result });
  });
}
