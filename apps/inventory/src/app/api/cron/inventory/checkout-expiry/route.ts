import { expireCheckoutReservations } from '@tuturuuu/inventory-core/commerce/checkouts';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCronLogDrain } from '@/lib/infrastructure/log-drain';

const BATCH_SIZE = 1000;
const MAX_BATCHES = 10;

export async function GET(request: NextRequest) {
  return withCronLogDrain(
    {
      jobId: 'inventory-checkout-expiry',
      path: '/api/cron/inventory/checkout-expiry',
      request,
    },
    () => handleGET(request)
  );
}

async function handleGET(request: NextRequest) {
  const cronSecret =
    process.env.CRON_SECRET ?? process.env.VERCEL_CRON_SECRET ?? '';
  if (
    !DEV_MODE &&
    (!cronSecret ||
      request.headers.get('authorization') !== `Bearer ${cronSecret}`)
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();
    let expired = 0;
    let batches = 0;

    while (batches < MAX_BATCHES) {
      const rows = await expireCheckoutReservations({
        limit: BATCH_SIZE,
        now,
      });
      expired += rows.length;
      batches += 1;
      if (rows.length < BATCH_SIZE) break;
    }

    return NextResponse.json({
      ok: true,
      processed: { batches, expired },
    });
  } catch (error) {
    console.error('Inventory checkout expiry cron failed', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
