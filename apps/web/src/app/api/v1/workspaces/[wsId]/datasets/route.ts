import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId: id } = await params;

  const { data, error } = await supabase
    .from('workspace_datasets')
    .select('*')
    .eq('ws_id', id)
    .single();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching workspace datasets' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId: id } = await params;

  const data = await req.json();

  const { error } = await supabase.from('workspace_datasets').insert({
    ...data,
    ws_id: id,
  });

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating workspace dataset' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
