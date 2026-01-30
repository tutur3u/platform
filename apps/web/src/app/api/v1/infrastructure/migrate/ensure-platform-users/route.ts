import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { requireDevMode } from '../batch-upsert';

/**
 * POST /api/v1/infrastructure/migrate/ensure-platform-users
 *
 * Ensures that platform users exist for the given IDs.
 * Creates placeholder users for any missing IDs with display_name set to a placeholder.
 *
 * This is used during migration to satisfy foreign key constraints when syncing data
 * from one environment to another (e.g., production to staging).
 *
 * Uses upsert with ignoreDuplicates for efficiency - no need to check existence first.
 */
export async function POST(req: Request) {
  const devModeError = requireDevMode();
  if (devModeError) return devModeError;

  try {
    const json = await req.json();
    const userIds: string[] = json?.user_ids || [];

    if (!userIds.length) {
      return Response.json({ created: 0, total: 0 });
    }

    // Filter out null, undefined, and empty strings
    const validUserIds = userIds.filter(
      (id) => id && typeof id === 'string' && id.trim().length > 0
    );

    if (!validUserIds.length) {
      return Response.json({ created: 0, total: 0 });
    }

    // Deduplicate
    const uniqueUserIds = [...new Set(validUserIds)];

    const sbAdmin = await createAdminClient();

    // Create placeholder users for all IDs using upsert with ignoreDuplicates
    // This is more efficient than checking which exist first:
    // - Avoids .in() queries which have URL length limits
    // - Let the database handle deduplication in a single operation
    // - No need for round-trip to check existence
    const placeholderUsers = uniqueUserIds.map((id) => ({
      id,
      display_name: `Migrated User (${id.substring(0, 8)}...)`,
    }));

    // Batch the upserts to avoid request body size limits
    const BATCH_SIZE = 500;
    const errors: Array<{ batch: number; error: unknown }> = [];

    for (let i = 0; i < placeholderUsers.length; i += BATCH_SIZE) {
      const batch = placeholderUsers.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

      const { error: insertError } = await sbAdmin
        .from('users')
        .upsert(batch, { onConflict: 'id', ignoreDuplicates: true });

      if (insertError) {
        console.error(
          `Error creating placeholder users (batch ${batchNumber}):`,
          insertError
        );
        errors.push({ batch: batchNumber, error: insertError });
      }
    }

    if (errors.length > 0) {
      return Response.json(
        {
          error: 'Failed to create some placeholder users',
          details: (errors[0]?.error as { message?: string })?.message,
          errorCount: errors.length,
          totalBatches: Math.ceil(placeholderUsers.length / BATCH_SIZE),
        },
        { status: 500 }
      );
    }

    console.log(
      `Ensured ${uniqueUserIds.length} platform users:`,
      uniqueUserIds.slice(0, 5),
      uniqueUserIds.length > 5 ? `... and ${uniqueUserIds.length - 5} more` : ''
    );

    return Response.json({
      created: uniqueUserIds.length,
      total: uniqueUserIds.length,
      message: 'Platform users ensured (new users created, existing skipped)',
    });
  } catch (error) {
    console.error('Error in ensure-platform-users:', error);
    return Response.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}
