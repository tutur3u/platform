import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { acceptHiveTradeOffer, createHiveTradeOffer } from '@/lib/hive/economy';
import {
  hiveJsonSchema,
  requireHiveAccess,
  withHiveRoute,
} from '../../../_shared';

type Params = {
  params: Promise<{ serverId: string }>;
};

const tradeActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    expiresAt: z.string().datetime().nullable().optional(),
    fromNpcId: z.string().uuid(),
    offeredCurrency: z.number().min(0).default(0),
    offeredItems: z.array(hiveJsonSchema).default([]),
    requestedCurrency: z.number().min(0).default(0),
    requestedItems: z.array(hiveJsonSchema).default([]),
    toNpcId: z.string().uuid().nullable().optional(),
  }),
  z.object({
    acceptingNpcId: z.string().uuid(),
    action: z.literal('accept'),
    tradeId: z.string().uuid(),
  }),
]);

export async function POST(request: NextRequest, { params }: Params) {
  const { serverId } = await params;
  const route = `/api/v1/hive/servers/${serverId}/trades`;

  return withHiveRoute(request, route, async () => {
    const access = await requireHiveAccess(request);
    if (!access.ok) return access.response;

    const body = await request.json().catch(() => null);
    const parsed = tradeActionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid Hive trade action' },
        { status: 400 }
      );
    }

    try {
      if (parsed.data.action === 'create') {
        const trade = await createHiveTradeOffer({
          expiresAt: parsed.data.expiresAt,
          fromNpcId: parsed.data.fromNpcId,
          offeredCurrency: parsed.data.offeredCurrency,
          offeredItems: parsed.data.offeredItems,
          requestedCurrency: parsed.data.requestedCurrency,
          requestedItems: parsed.data.requestedItems,
          serverId,
          toNpcId: parsed.data.toNpcId,
        });
        return NextResponse.json({ trade }, { status: 201 });
      }

      const accepted = await acceptHiveTradeOffer({
        acceptingNpcId: parsed.data.acceptingNpcId,
        serverId,
        tradeId: parsed.data.tradeId,
      });
      return NextResponse.json(accepted);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Trade failed' },
        { status: 400 }
      );
    }
  });
}
