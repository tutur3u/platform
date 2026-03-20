import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    roleId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { roleId } = await params;

  const { data, error, count } = await supabase
    .from('workspace_role_members')
    .select(
      '...users!inner(id, display_name, full_name, avatar_url, ...user_private_details(email))',
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

  return NextResponse.json({ data: data ?? [], count: count ?? 0 });
}

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();
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
