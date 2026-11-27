import { withCronLogDrain } from '@tuturuuu/inventory-core/infrastructure/log-drain';
import { createPolarClient } from '@tuturuuu/payment/polar/server';
import { syncProductToDatabase } from '@tuturuuu/payment-core/polar-product-helper';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { timingSafeStringEqual } from '@/lib/timing-safe-string-equal';

/**
 * Cron job to sync products from Polar.sh to database
 * Runs periodically to ensure all products are up-to-date
 */
export async function GET(req: NextRequest) {
  return withCronLogDrain(
    {
      jobId: 'payment-products',
      path: '/api/cron/payment/products',
      request: req,
    },
    () => handleGET(req)
  );
}

async function handleGET(req: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get('authorization');
    const cronSecret =
      process.env.CRON_SECRET ?? process.env.VERCEL_CRON_SECRET ?? '';

    if (
      !DEV_MODE &&
      (!cronSecret ||
        !timingSafeStringEqual(authHeader ?? '', `Bearer ${cronSecret}`))
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const polar = createPolarClient();
    const sbAdmin = await createAdminClient();

    let processedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    // Fetch all products from Polar (paginated)
    let hasMore = true;
    const maxPages = 10;
    const deadline = AbortSignal.any([
      req.signal,
      AbortSignal.timeout(100_000),
    ]);
    let page = 1;
    const limit = 100;

    while (hasMore && page <= maxPages && !deadline.aborted) {
      try {
        const response = await polar.products.list(
          {
            limit,
            page,
          },
          { signal: deadline, retries: { strategy: 'none' } }
        );

        const lastPage = response.result?.pagination.maxPage ?? page;
        if (lastPage > maxPages) {
          errors.push('Catalog page budget exceeded');
          break;
        }

        const products = response.result?.items ?? [];

        if (products.length === 0) {
          hasMore = false;
          break;
        }

        // Process each product
        for (const product of products) {
          deadline.throwIfAborted();
          try {
            await syncProductToDatabase(sbAdmin, product);
            processedCount++;
          } catch (error) {
            failedCount++;
            const errorMessage =
              error instanceof Error ? error.message : 'Unknown error';
            errors.push(`Product ${product.id}: ${errorMessage}`);
          }
        }

        hasMore = page < lastPage;
        page++;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Failed to fetch page ${page}: ${errorMessage}`);
        hasMore = false;
      }
    }

    if (hasMore && errors.length === 0) errors.push('Catalog budget reached');
    const ok = errors.length === 0;
    return NextResponse.json(
      {
        ok,
        message: 'Product sync completed',
        processed: processedCount,
        failed: failedCount,
        errors: errors.slice(0, 20), // Limit error messages
      },
      { status: ok ? 200 : 500 }
    );
  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
