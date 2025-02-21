import { createClient } from '@tutur3u/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const session = await supabase.auth.getSession();
  if (!session.data.session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { wsId } = await params;
  const { data: wsAccess } = await supabase
    .from('workspace_users')
    .select('role')
    .eq('ws_id', wsId)
    .eq('user_id', session.data.session.user.id)
    .single();
  if (!wsAccess) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { data, error } = await supabase
    .from('workspace_users')
    .select('email')
    .eq('ws_id', wsId);

  if (error) {
    console.log('Error getting users', error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const email = data?.map((email) => email.email) || [];

  return NextResponse.json({ email }, { status: 200 });
}
