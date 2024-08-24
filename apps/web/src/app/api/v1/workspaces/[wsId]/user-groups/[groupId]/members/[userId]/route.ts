import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

interface Params {
  params: {
    groupId: string;
    userId: string;
  };
}

export async function DELETE(
  _: Request,
  { params: { groupId, userId } }: Params
) {
  const supabase = createClient();

  const { error } = await supabase
    .from('workspace_user_groups_users')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error removing group member' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
