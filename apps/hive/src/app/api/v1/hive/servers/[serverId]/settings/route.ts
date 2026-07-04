import { type NextRequest, NextResponse } from 'next/server';
import { updateHiveServer } from '@/lib/hive/hive-db';
import {
  hiveServerSettingsSchema,
  mapHiveServer,
  requireHiveAdmin,
  withHiveRoute,
} from '../../../_shared';

const ROUTE = '/api/v1/hive/servers/[serverId]/settings';

type Params = {
  params: Promise<{
    serverId: string;
  }>;
};

export async function PATCH(request: NextRequest, { params }: Params) {
  const { serverId } = await params;

  return withHiveRoute(request, ROUTE, async () => {
    const result = await requireHiveAdmin(request);
    if (!result.ok) return result.response;

    const body = await request.json().catch(() => null);
    const parsed = hiveServerSettingsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid Hive settings payload' },
        { status: 400 }
      );
    }

    const server = await updateHiveServer(serverId, {
      settings: parsed.data,
    });

    if (!server) {
      return NextResponse.json(
        { error: 'Failed to update Hive settings' },
        { status: 400 }
      );
    }

    return NextResponse.json({ server: mapHiveServer(server) });
  });
}
