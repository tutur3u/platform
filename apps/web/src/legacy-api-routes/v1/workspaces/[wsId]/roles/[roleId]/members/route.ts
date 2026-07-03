import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { normalizeRoleMembers } from '@/lib/workspace-role-members';

interface Params {
  params: Promise<{
    wsId: string;
    roleId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const supabase = await createClient(req);
  const { roleId, wsId } = await params;

  const { data: role, error: roleError } = await supabase
    .from('workspace_roles')
    .select('id')
    .eq('id', roleId)
    .eq('ws_id', wsId)
    .single();

  if (roleError || !role) {
    console.log(roleError);
    return NextResponse.json({ message: 'Role not found' }, { status: 404 });
  }

  const { data, error, count } = await supabase
    .from('workspace_role_members')
    .select(
      'user_id, users:user_id(id, display_name, avatar_url, user_private_details(email))',
      {
        count: 'exact',
      }
    )
    .eq('role_id', roleId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching role members' },
      { status: 500 }
    );
  }

  const members = normalizeRoleMembers(data as any[]).map((member) => ({
    id: member.id,
    display_name: member.display_name,
    full_name: member.full_name ?? null,
    avatar_url: member.avatar_url,
    email: member.email,
  }));

  return NextResponse.json({ data: members, count: count ?? members.length });
}

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient(req);
  const { roleId } = await params;

  const data = (await req.json()) as {
    memberIds: string[];
  };

  if (!data?.memberIds)
    return NextResponse.json({ message: 'Invalid request' }, { status: 400 });

  const { error: roleError } = await supabase
    .from('workspace_role_members')
    .insert(
      data.memberIds.map((memberId) => ({
        user_id: memberId,
        role_id: roleId,
      }))
    );

  if (roleError) {
    console.log(roleError);
    return NextResponse.json(
      { message: 'Error adding new members to role' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
