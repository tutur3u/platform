import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

interface Params {
  params: {
    wsId: string;
  };
}

export async function GET(_: Request, { params: { wsId } }: Params) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('workspace_boards')
    .select('*')
    .eq('ws_id', wsId)
    .single();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching workspace boards' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function POST(req: Request, { params: { wsId } }: Params) {
  const supabase = createClient();

  const data = await req.json();

  const { error } = await supabase
    .from('workspace_boards')
    .insert({
      ...data,
      ws_id: wsId,
    })
    .select('id')
    .single();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating workspace board' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
