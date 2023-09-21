import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

interface Params {
  params: {
    wsId: string;
    userId: string;
    invited?: string;
  };
}

export async function PUT(
  req: Request,
  { params: { wsId, userId, invited } }: Params
) {
  const supabase = createRouteHandlerClient({ cookies });

  const { role, role_title } = await req.json();

  const { error } = await supabase
    .from(invited ? 'workspace_invites' : 'workspace_members')
    .update({ role: role, role_title: role_title })
    .eq('ws_id', wsId)
    .eq('user_id', userId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating workspace member' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(
  _: Request,
  { params: { wsId, userId, invited } }: Params
) {
  const supabase = createRouteHandlerClient({ cookies });

  const { error } = await supabase
    .from(invited ? 'workspace_invites' : 'workspace_members')
    .delete()
    .eq('ws_id', wsId)
    .eq('user_id', userId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting workspace member' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
