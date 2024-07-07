import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

interface Params {
  params: {
    roleId: string;
    userId: string;
  };
}

export async function DELETE(
  _: Request,
  { params: { roleId, userId } }: Params
) {
  const supabase = createClient();

  const { error } = await supabase
    .from('workspace_role_members')
    .delete()
    .eq('role_id', roleId)
    .eq('user_id', userId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error removing role member' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
