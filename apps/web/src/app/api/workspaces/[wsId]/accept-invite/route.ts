import { createClient } from '@ncthub/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function POST(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId } = await params;

  const { error } = await supabase
    .from('workspace_members')
    .insert({ ws_id: wsId });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 401 });

  return NextResponse.json({ message: 'success' });
}
