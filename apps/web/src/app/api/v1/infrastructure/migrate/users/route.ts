import { createClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { NextResponse } from 'next/server';

export async function PUT(req: Request) {
  const supabase = await createClient();

  const json = await req.json();
  const users = (json?.data || []) as WorkspaceUser[];
  const BATCH_SIZE = 50;

  // Get existing users in batches of 50
  const allExistingUsers = [];
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

  // Merge users with existing data, preserving existing emails
  const usersToUpdate = users.map((user) => {
    const existingUser = existingUsersMap.get(user.id);

    // If user exists and has an email, use that email instead
    if (existingUser?.email) {
      return {
        ...user,
        email: existingUser.email,
      };
    }

    return user;
  });

  // Update all users in a single operation
  const { error: updateError } = await supabase
    .from('workspace_users')
    .upsert(usersToUpdate as WorkspaceUser[]);

  if (updateError) {
    console.log(updateError);
    return NextResponse.json(
      { message: 'Error updating users' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
