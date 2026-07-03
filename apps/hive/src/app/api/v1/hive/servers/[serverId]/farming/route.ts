import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { runHiveFarmingAction } from '@/lib/hive/economy';
import {
  hiveVectorSchema,
  requireHiveAccess,
  withHiveRoute,
} from '../../../_shared';

type Params = {
  params: Promise<{ serverId: string }>;
};

const farmingActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('plant'),
    cropType: z.string().trim().min(1).max(80).default('turnip'),
    npcId: z.string().uuid().optional(),
    position: hiveVectorSchema,
  }),
  z.object({
    action: z.literal('water'),
    cropId: z.string().uuid(),
  }),
  z.object({
    action: z.literal('harvest'),
    cropId: z.string().uuid(),
    npcId: z.string().uuid().optional(),
  }),
]);

export async function POST(request: NextRequest, { params }: Params) {
  const { serverId } = await params;
  const route = `/api/v1/hive/servers/${serverId}/farming`;

  return withHiveRoute(request, route, async () => {
    const access = await requireHiveAccess(request);
    if (!access.ok) return access.response;

    const body = await request.json().catch(() => null);
    const parsed = farmingActionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid Hive farming action' },
        { status: 400 }
      );
    }

    try {
      const result = await runHiveFarmingAction({
        ...parsed.data,
        actorUserId: access.access.user.id,
        serverId,
      });
      return NextResponse.json(result);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Farming failed' },
        { status: 400 }
      );
    }
  });
}
