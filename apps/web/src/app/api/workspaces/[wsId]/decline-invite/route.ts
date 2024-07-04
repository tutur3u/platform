import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

interface Params {
  params: {
    wsId: string;
  };
}

export async function POST(_: Request, { params: { wsId } }: Params) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('workspace_invites')
    .delete()
    .eq('ws_id', wsId);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 401 });

  return NextResponse.json(data);
}
