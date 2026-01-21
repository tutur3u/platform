import { createAdminClient } from '@tuturuuu/supabase/next/server';

/**
 * POST /api/v1/infrastructure/migrate/ensure-platform-users
 *
 * Ensures that platform users exist for the given IDs.
 * Creates placeholder users for any missing IDs with display_name and full_name set to the ID.
 *
 * This is used during migration to satisfy foreign key constraints when syncing data
 * from one environment to another (e.g., production to staging).
 */
export async function POST(req: Request) {
  try {
    const json = await req.json();
    const userIds: string[] = json?.user_ids || [];

    if (!userIds.length) {
      return Response.json({ created: 0, existing: 0 });
    }

    // Filter out null, undefined, and empty strings
    const validUserIds = userIds.filter(
      (id) => id && typeof id === 'string' && id.trim().length > 0
    );

    if (!validUserIds.length) {
      return Response.json({ created: 0, existing: 0 });
    }

    // Deduplicate
    const uniqueUserIds = [...new Set(validUserIds)];

    const sbAdmin = await createAdminClient();

    // Check which users already exist
    const { data: existingUsers, error: fetchError } = await sbAdmin
      .from('users')
      .select('id')
      .in('id', uniqueUserIds);

    if (fetchError) {
      console.error('Error fetching existing users:', fetchError);
      return Response.json(
        {
          error: 'Failed to check existing users',
          details: fetchError.message,
        },
        { status: 500 }
      );
    }

    const existingIds = new Set(existingUsers?.map((u) => u.id) || []);
    const missingIds = uniqueUserIds.filter((id) => !existingIds.has(id));

    if (!missingIds.length) {
      return Response.json({
        created: 0,
        existing: existingIds.size,
        message: 'All users already exist',
      });
    }

    // Create placeholder users for missing IDs
    // Note: The users table in Supabase Auth requires specific handling
    // We'll create records in the public.users table which is the profile table
    const placeholderUsers = missingIds.map((id) => ({
      id,
      display_name: id,
      full_name: `Migrated User (${id.substring(0, 8)}...)`,
    }));

    const { error: insertError } = await sbAdmin
      .from('users')
      .upsert(placeholderUsers, { onConflict: 'id', ignoreDuplicates: true });

    if (insertError) {
      console.error('Error creating placeholder users:', insertError);
      return Response.json(
        {
          error: 'Failed to create placeholder users',
          details: insertError.message,
        },
        { status: 500 }
      );
    }

    console.log(
      `Created ${missingIds.length} placeholder users:`,
      missingIds.slice(0, 5),
      missingIds.length > 5 ? `... and ${missingIds.length - 5} more` : ''
    );

    return Response.json({
      created: missingIds.length,
      existing: existingIds.size,
      createdIds: missingIds,
    });
  } catch (error) {
    console.error('Error in ensure-platform-users:', error);
    return Response.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}
