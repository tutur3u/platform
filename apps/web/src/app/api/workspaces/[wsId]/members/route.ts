import { createClient } from '@tutur3u/supabase/next/server';
import { NextRequest, NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { wsId } = await params;
  const searchParams = req.nextUrl.searchParams;

  const userId = searchParams.get('id');
  const userEmail = searchParams.get('email');

  const supabase = await createClient();
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

export async function DELETE(req: NextRequest, { params }: Params) {
  const { wsId } = await params;
  const searchParams = req.nextUrl.searchParams;

  const userId = searchParams.get('id');
  const userEmail = searchParams.get('email');

  const supabase = await createClient();

  const inviteQuery = userId
    ? supabase
        .from('workspace_invites')
        .delete()
        .eq('ws_id', wsId)
        .eq('user_id', userId)
    : { error: undefined };

  const emailInviteQuery = userEmail
    ? supabase
        .from('workspace_email_invites')
        .delete()
        .eq('ws_id', wsId)
        .eq('email', userEmail)
    : { error: undefined };

  const memberQuery = userId
    ? supabase
        .from('workspace_members')
        .delete()
        .eq('ws_id', wsId)
        .eq('user_id', userId)
    : { error: undefined };

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
