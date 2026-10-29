import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const MembersSchema = z.object({
  memberIds: z.array(z.guid()).min(1),
});

export async function addWorkspaceRoleMembers({
  request,
  admin,
  wsId,
  roleId,
}: {
  request: Request;
  admin: TypedSupabaseClient;
  wsId: string;
  roleId: string;
}) {
  const parsed = MembersSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid request' }, { status: 400 });
  }
  const memberIds = [...new Set(parsed.data.memberIds)];
  const { data: members, error: membersError } = await admin
    .from('workspace_members')
    .select('user_id')
    .eq('ws_id', wsId)
    // Guests can't hold roles; only full members are assignable.
    .eq('type', 'MEMBER')
    .in('user_id', memberIds);
  if (membersError) {
    console.error('Error validating workspace role members', {
      error: membersError,
      wsId,
    });
    return NextResponse.json(
      { message: 'Unable to validate members' },
      { status: 500 }
    );
  }
  if (members?.length !== memberIds.length) {
    return NextResponse.json(
      { message: 'Invalid workspace members' },
      { status: 400 }
    );
  }
  const { error } = await admin
    .from('workspace_role_members')
    .insert(memberIds.map((userId) => ({ user_id: userId, role_id: roleId })));
  if (error) {
    console.error('Error adding workspace role members', {
      error,
      wsId,
      roleId,
    });
    return NextResponse.json(
      { message: 'Error adding members to role' },
      { status: 500 }
    );
  }
  return NextResponse.json({ message: 'success' });
}
