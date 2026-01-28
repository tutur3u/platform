import { createPolarClient } from '@tuturuuu/payment/polar/client';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { Constants, type WorkspaceProductTier } from '@tuturuuu/types';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/**
 * Cron job to sync products from Polar.sh to database
 * Runs periodically to ensure all products are up-to-date
 */
export async function GET(req: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get('authorization');
    const cronSecret =
      process.env.CRON_SECRET ?? process.env.VERCEL_CRON_SECRET ?? '';

    if (!DEV_MODE && (!cronSecret || authHeader !== `Bearer ${cronSecret}`)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const polar = createPolarClient();
    const sbAdmin = await createAdminClient();

    let processedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    // Fetch all products from Polar (paginated)
    let hasMore = true;
    let page = 1;
    const limit = 100;

    while (hasMore) {
      try {
        const response = await polar.products.list({
          limit,
          page,
        });

        const products = response.result?.items ?? [];

        if (products.length === 0) {
          hasMore = false;
          break;
        }

        // Process each product
        for (const product of products) {
          try {
            // Extract product_tier from metadata
            const validTiers = Constants.public.Enums.workspace_product_tier;
            const metadataProductTier = product.metadata?.product_tier;

            // Only set tier if it matches valid enum values
            const tier =
              metadataProductTier &&
              typeof metadataProductTier === 'string' &&
              validTiers.includes(
                metadataProductTier.toUpperCase() as WorkspaceProductTier
              )
                ? (metadataProductTier.toUpperCase() as WorkspaceProductTier)
                : null;

            // Extract price from first price entry
            const firstPrice =
              product.prices.length > 0 ? (product.prices[0] as any) : null;

            const price =
              firstPrice && 'priceAmount' in firstPrice
                ? firstPrice.priceAmount
                : 0;

            const isSeatBased =
              firstPrice &&
              'amountType' in firstPrice &&
              firstPrice.amountType === 'seat_based';

            const pricePerSeat = isSeatBased
              ? (firstPrice?.seatTiers?.tiers?.[0]?.pricePerSeat ?? null)
              : null;

            const minSeats = isSeatBased
              ? (firstPrice?.seatTiers?.minimumSeats ?? null)
              : null;

            const maxSeats = isSeatBased
              ? (firstPrice?.seatTiers?.maximumSeats ?? null)
              : null;

            // Prepare product data
            const productData = {
              id: product.id,
              name: product.name,
              description: product.description || '',
              price: price,
              recurring_interval: product.recurringInterval || 'month',
              tier,
              archived: product.isArchived ?? false,
              pricing_model: isSeatBased
                ? ('seat_based' as const)
                : ('fixed' as const),
              price_per_seat: pricePerSeat,
              min_seats: minSeats,
              max_seats: maxSeats,
            };

            // Upsert product
            const { error: dbError } = await sbAdmin
              .from('workspace_subscription_products')
              .upsert(productData, {
                onConflict: 'id',
                ignoreDuplicates: false,
              });

            if (dbError) {
              failedCount++;
              errors.push(`Product ${product.id}: ${dbError.message}`);
            } else {
              processedCount++;
            }
          } catch (error) {
            failedCount++;
            const errorMessage =
              error instanceof Error ? error.message : 'Unknown error';
            errors.push(`Product ${product.id}: ${errorMessage}`);
          }
        }

        // Check if there are more pages
        if (products.length < limit) {
          hasMore = false;
        } else {
          page++;
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Failed to fetch page ${page}: ${errorMessage}`);
        hasMore = false;
      }
    }

    return NextResponse.json({
      message: 'Product sync completed',
      processed: processedCount,
      failed: failedCount,
      errors: errors.slice(0, 20), // Limit error messages
    });
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

export const maxDuration = 300; // 5 minutes
