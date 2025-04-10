import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
    projectId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId, projectId } = await params;

  const { data, error } = await supabase
    .from('workspace_architecture_projects')
    .select('*')
    .eq('ws_id', wsId)
    .eq('id', projectId)
    .single();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching architecture project' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId, projectId } = await params;

  const body = await req.json();

  const { error } = await supabase
    .from('workspace_architecture_projects')
    .update(body)
    .eq('ws_id', wsId)
    .eq('id', projectId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating architecture project' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId, projectId } = await params;

  const { error } = await supabase
    .from('workspace_architecture_projects')
    .delete()
    .eq('ws_id', wsId)
    .eq('id', projectId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting architecture project' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
