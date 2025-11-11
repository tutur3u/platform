import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function POST(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId } = await params;

  // Get authenticated user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Insert user as workspace member
  const { error } = await supabase
    .from('workspace_members')
    .insert({ ws_id: wsId, user_id: user.id });

  if (error) {
    console.error('Error accepting invite:', error);
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  // Delete the invite after accepting
  await supabase
    .from('workspace_invites')
    .delete()
    .eq('ws_id', wsId)
    .eq('user_id', user.id);

  // Also delete email invite if exists
  // Get email from auth (more reliable)
  let userEmail = user.email;

  // Fallback: try from user_private_details
  if (!userEmail) {
    const { data: userData } = await supabase
      .from('users')
      .select('email:user_private_details(email)')
      .eq('id', user.id)
      .single();

    userEmail = (userData?.email as any)?.[0]?.email;
  }

  if (userEmail) {
    await supabase
      .from('workspace_email_invites')
      .delete()
      .eq('ws_id', wsId)
      .eq('email', userEmail);
  }

  return NextResponse.json({ message: 'success' });
}
