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

  const { data, error } = await supabase
    .from('workspace_invites')
    .delete()
    .eq('ws_id', wsId);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 401 });

  return NextResponse.json(data);
}
