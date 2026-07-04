import { createClient } from '@tuturuuu/supabase/next/server';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
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
  const membership = await verifyWorkspaceMembershipType({
    wsId,
    userId: session.data.session.user.id,
    supabase,
  });

  if (membership.error === 'membership_lookup_failed') {
    return NextResponse.json(
      { error: 'Failed to verify workspace access' },
      { status: 500 }
    );
  }

  if (!membership.ok) {
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
