import { createClient } from '@tutur3u/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    roleId: string;
    userId: string;
  }>;
}

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { roleId, userId } = await params;

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
