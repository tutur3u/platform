import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface Params {
  params: {
    wsId: string;
  };
}

export async function POST(_: Request, { params: { wsId } }: Params) {
  const supabase = createRouteHandlerClient({ cookies });

  const { data, error } = await supabase
    .from('workspace_invites')
    .delete()
    .eq('ws_id', wsId);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 401 });

  return NextResponse.json(data);
}
