import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

interface Params {
  params: {
    wsId: string;
  };
}

export async function POST(_: Request, { params: { wsId } }: Params) {
  const supabase = createClient();

  const { error } = await supabase
    .from('workspace_members')
    .insert({ ws_id: wsId });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 401 });

  return NextResponse.json({ message: 'success' });
}
