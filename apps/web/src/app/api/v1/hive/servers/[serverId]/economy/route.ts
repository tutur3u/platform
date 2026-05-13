import { type NextRequest, NextResponse } from 'next/server';
import { listHiveLedgerEntries } from '@/lib/hive/economy';
import { getHiveSnapshot } from '@/lib/hive/hive-db';
import { requireHiveAccess, withHiveRoute } from '../../../_shared';

type Params = {
  params: Promise<{ serverId: string }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  const { serverId } = await params;
  const route = `/api/v1/hive/servers/${serverId}/economy`;

  return withHiveRoute(request, route, async () => {
    const access = await requireHiveAccess(request);
    if (!access.ok) return access.response;

    const snapshot = await getHiveSnapshot(serverId);
    if (!snapshot.server) {
      return NextResponse.json(
        { error: 'Hive server not found' },
        { status: 404 }
      );
    }

    const ledger = await listHiveLedgerEntries(serverId);

    return NextResponse.json({
      economy: {
        crops: snapshot.crops,
        inventories: snapshot.inventories,
        ledger,
        totalCurrency: Number(snapshot.server.total_currency ?? 0),
        warehouses: snapshot.warehouses,
      },
    });
  });
}
