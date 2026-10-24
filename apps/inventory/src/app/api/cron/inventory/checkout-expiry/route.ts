import { expireCheckoutReservations } from '@tuturuuu/inventory-core/commerce/checkouts';
import { revalidateWorkspaceStorefronts } from '@tuturuuu/inventory-core/commerce/public-storefront';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCronLogDrain } from '@/lib/infrastructure/log-drain';

const BATCH_SIZE = 1000;
const MAX_BATCHES = 10;
// Cron Control's Worker processor expires checkouts in the database directly
// and posts the affected workspaces here, because storefront caches can only
// be revalidated inside the Next.js host.
const MAX_REVALIDATION_WORKSPACES = 100;
const MAX_REVALIDATION_BODY_BYTES = 8_192;
const WORKSPACE_ID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

function isAuthorized(request: NextRequest) {
  const cronSecret =
    process.env.CRON_SECRET ?? process.env.VERCEL_CRON_SECRET ?? '';
  return (
    DEV_MODE ||
    (!!cronSecret &&
      request.headers.get('authorization') === `Bearer ${cronSecret}`)
  );
}

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
  if (!isAuthorized(request)) {
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

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_REVALIDATION_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }
  let workspaceIds: unknown;
  try {
    workspaceIds = (JSON.parse(text) as { revalidateWorkspaceIds?: unknown })
      ?.revalidateWorkspaceIds;
  } catch {
    workspaceIds = undefined;
  }
  if (
    !Array.isArray(workspaceIds) ||
    workspaceIds.length > MAX_REVALIDATION_WORKSPACES ||
    !workspaceIds.every((id) => typeof id === 'string' && WORKSPACE_ID.test(id))
  ) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const unique = [...new Set(workspaceIds as string[])];
  const results: { wsId: string; ok: boolean }[] = [];
  for (const wsId of unique) {
    try {
      await revalidateWorkspaceStorefronts(wsId);
      results.push({ wsId, ok: true });
    } catch (error) {
      console.error('Checkout expiry storefront invalidation failed', {
        error,
        wsId,
      });
      results.push({ wsId, ok: false });
    }
  }
  return NextResponse.json({
    ok: results.every((result) => result.ok),
    revalidated: results.filter((result) => result.ok).length,
    results,
  });
}
