import { Database } from '@/types/supabase';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface Params {
  params: {
    wsId: string;
  };
}

export async function POST(req: Request, { params: { wsId } }: Params) {
  const supabase = createRouteHandlerClient<Database>({ cookies });

  const { userId, role, accessLevel } = await req.json();

  const { error } = await supabase.from('workspace_invites').insert({
    ws_id: wsId,
    user_id: userId,
    role_title: role,
    role: accessLevel,
  });

  if (error) {
    console.log(error);
    return NextResponse.json(
      {
        message: error.message.includes('duplicate key value')
          ? 'User is already a member of this workspace or has a pending invite.'
          : 'Error inviting workspace member.',
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
