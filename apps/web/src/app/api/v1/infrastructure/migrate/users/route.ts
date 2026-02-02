import { createClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { NextResponse } from 'next/server';
import { batchUpsert, requireDevMode } from '../batch-upsert';

const BATCH_SIZE = 500;

export async function PUT(req: Request) {
  const devModeError = requireDevMode();
  if (devModeError) return devModeError;

  const supabase = await createClient();

  const json = await req.json();
  const users = (json?.data || []) as WorkspaceUser[];

  // Get existing users in batches to preserve emails
  const allExistingUsers: { id: string; email: string | null }[] = [];
  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);
    const { data: existingUsers } = await supabase
      .from('workspace_users')
      .select('id, email')
      .in(
        'id',
        batch.map((u) => u.id)
      );

    if (existingUsers) allExistingUsers.push(...existingUsers);
  }

  const existingUsersMap = new Map(allExistingUsers.map((u) => [u.id, u]));
  console.log('Total existing users found:', allExistingUsers.length);

  // Store original updated_by values for later update
  const updatedByMap = new Map<string, string | null>();

  // Merge users with existing data, preserving existing emails
  // Also null out self-referencing FKs to avoid constraint violations
  const usersToInsert = users.map((user) => {
    const existingUser = existingUsersMap.get(user.id);
    const userRecord = user as unknown as Record<string, unknown>;

    // Store the original updated_by value
    if (userRecord.updated_by) {
      updatedByMap.set(user.id, userRecord.updated_by as string);
    }

    const baseUser = {
      ...user,
      // Null out self-referencing FKs on initial insert
      updated_by: null,
      created_by: null,
    };

    // If user exists and has an email, use that email instead
    if (existingUser?.email) {
      return {
        ...baseUser,
        email: existingUser.email,
      };
    }

    return baseUser;
  });

  // Phase 1: Insert all users with nulled self-references
  const insertResult = await batchUpsert({
    table: 'workspace_users',
    data: usersToInsert,
    supabase,
  });

  if (!insertResult.success) {
    return NextResponse.json(
      {
        message: 'Error migrating users (phase 1: insert)',
        successCount: insertResult.successCount,
        errorCount: insertResult.errorCount,
        totalBatches: insertResult.totalBatches,
      },
      { status: 500 }
    );
  }

  // Phase 2: Update self-referencing fields now that all users exist
  const usersWithUpdatedBy = users
    .filter((u) => {
      const record = u as unknown as Record<string, unknown>;
      return record.updated_by || record.created_by;
    })
    .map((u) => {
      const record = u as unknown as Record<string, unknown>;
      return {
        id: u.id,
        updated_by: (record.updated_by as string) ?? null,
        created_by: (record.created_by as string) ?? null,
      };
    });

  if (usersWithUpdatedBy.length > 0) {
    console.log(
      `Updating self-references for ${usersWithUpdatedBy.length} users`
    );

    const updateResult = await batchUpsert({
      table: 'workspace_users',
      data: usersWithUpdatedBy,
      supabase,
    });

    if (!updateResult.success) {
      console.error(
        'Some self-reference updates failed:',
        updateResult.errorCount
      );
      // Don't fail the whole migration, just log the issue
    }
  }

  return NextResponse.json({
    message: 'success',
    count: insertResult.successCount,
    phase2Updates: usersWithUpdatedBy.length,
  });
}
