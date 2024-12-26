import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function POST(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId } = await params;

  const { error: workspaceInvitesError } = await supabase
    .from('workspace_invites')
    .delete()
    .eq('ws_id', wsId);

  const { error: workspaceEmailInvitesError } = await supabase
    .from('workspace_email_invites')
    .delete()
    .eq('ws_id', wsId);

  if (workspaceInvitesError || workspaceEmailInvitesError)
    return NextResponse.json(
      {
        error:
          workspaceInvitesError?.message || workspaceEmailInvitesError?.message,
      },
      { status: 401 }
    );

  return NextResponse.json({
    message: 'Invites declined successfully',
  });
}
