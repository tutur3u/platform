import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId } = await params;

  const { email, role, accessLevel } = await req.json();

  const { error } = await supabase.from('workspace_email_invites').insert({
    ws_id: wsId,
    email,
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
