import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface Params {
  params: {
    wsId: string;
  };
}

export async function PUT(req: NextRequest, { params: { wsId } }: Params) {
  const searchParams = req.nextUrl.searchParams;

  const userId = searchParams.get('id');
  const userEmail = searchParams.get('email');

  const supabase = createRouteHandlerClient({ cookies });
  const { pending, role, role_title } = await req.json();

  const query = supabase
    .from(
      pending
        ? userId
          ? 'workspace_invites'
          : 'workspace_email_invites'
        : 'workspace_members'
    )
    .update({ role: role, role_title: role_title })
    .eq('ws_id', wsId);

  if (userId) query.eq('user_id', userId);
  if (userEmail) query.eq('email', userEmail);

  const { error } = await query;

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating workspace member' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(req: NextRequest, { params: { wsId } }: Params) {
  const searchParams = req.nextUrl.searchParams;

  const userId = searchParams.get('id');
  const userEmail = searchParams.get('email');

  const supabase = createRouteHandlerClient({ cookies });

  const inviteQuery = supabase
    .from('workspace_invites')
    .delete()
    .eq('ws_id', wsId)
    .eq('user_id', userId);

  const emailInviteQuery = supabase
    .from('workspace_email_invites')
    .delete()
    .eq('ws_id', wsId)
    .eq('email', userEmail);

  const memberQuery = supabase
    .from('workspace_members')
    .delete()
    .eq('ws_id', wsId)
    .eq('user_id', userId);

  // use Promise.all to run all queries in parallel
  const [inviteData, emailInviteData, memberData] = await Promise.all([
    inviteQuery,
    emailInviteQuery,
    memberQuery,
  ]);

  if (inviteData.error || emailInviteData.error || memberData.error) {
    console.log(inviteData.error, emailInviteData.error, memberData.error);
    return NextResponse.json(
      { message: 'Error deleting workspace member' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
