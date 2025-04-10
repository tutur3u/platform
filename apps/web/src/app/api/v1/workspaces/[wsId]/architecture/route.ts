import { createClient } from '@tuturuuu/supabase/next/server';
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
    .from('workspace_architecture_projects')
    .select('*')
    .eq('ws_id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching architecture projects' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId: id } = await params;

  const body = await req.json();

  const { data, error } = await supabase
    .from('workspace_architecture_projects')
    .insert({
      ...body,
      ws_id: id,
    })
    .select('id')
    .single();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating architecture project' },
      { status: 500 }
    );
  }

  return NextResponse.json({ id: data.id, message: 'success' });
}
