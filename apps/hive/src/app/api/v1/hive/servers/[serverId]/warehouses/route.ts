import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createHiveWarehouse, transferHiveInventory } from '@/lib/hive/economy';
import {
  hiveVectorSchema,
  requireHiveAccess,
  withHiveRoute,
} from '../../../_shared';

type Params = {
  params: Promise<{ serverId: string }>;
};

const ownerTypeSchema = z.enum(['npc', 'warehouse']);

const warehouseActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    capacity: z.number().int().min(1).max(50_000).default(500),
    name: z.string().trim().min(1).max(120),
    position: hiveVectorSchema,
  }),
  z.object({
    action: z.literal('transfer'),
    fromOwnerId: z.string().uuid(),
    fromOwnerType: ownerTypeSchema,
    itemType: z.string().trim().min(1).max(80),
    quantity: z.number().int().min(1).max(10_000),
    toOwnerId: z.string().uuid(),
    toOwnerType: ownerTypeSchema,
  }),
]);

export async function POST(request: NextRequest, { params }: Params) {
  const { serverId } = await params;
  const route = `/api/v1/hive/servers/${serverId}/warehouses`;

  return withHiveRoute(request, route, async () => {
    const access = await requireHiveAccess(request);
    if (!access.ok) return access.response;

    const body = await request.json().catch(() => null);
    const parsed = warehouseActionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid Hive warehouse action' },
        { status: 400 }
      );
    }

    try {
      if (parsed.data.action === 'create') {
        const warehouse = await createHiveWarehouse({
          capacity: parsed.data.capacity,
          name: parsed.data.name,
          position: parsed.data.position,
          serverId,
        });
        return NextResponse.json({ warehouse }, { status: 201 });
      }

      const transfer = await transferHiveInventory({
        fromOwnerId: parsed.data.fromOwnerId,
        fromOwnerType: parsed.data.fromOwnerType,
        itemType: parsed.data.itemType,
        quantity: parsed.data.quantity,
        serverId,
        toOwnerId: parsed.data.toOwnerId,
        toOwnerType: parsed.data.toOwnerType,
      });
      return NextResponse.json(transfer);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error ? error.message : 'Warehouse action failed',
        },
        { status: 400 }
      );
    }
  });
}
