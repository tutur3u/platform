import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

interface Params {
  params: {
    groupId: string;
  };
}

export async function GET(_: Request, { params: { groupId } }: Params) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('workspace_user_groups_users')
    .select('*', {
      count: 'exact',
    })
    .eq('group_id', groupId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching group members' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function POST(req: Request, { params: { groupId } }: Params) {
  const supabase = createClient();

  const data = (await req.json()) as {
    memberIds: string[];
  };

  if (!data?.memberIds)
    return NextResponse.json({ message: 'Invalid request' }, { status: 400 });

  const { error: groupError } = await supabase
    .from('workspace_user_groups_users')
    .insert(
      data.memberIds.map((memberId) => ({
        user_id: memberId,
        group_id: groupId,
      }))
    );

  if (groupError) {
    console.log(groupError);
    return NextResponse.json(
      { message: 'Error adding new members to group' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
