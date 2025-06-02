import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
    userId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId, userId } = await params;

  const { data, error } = await supabase
    .from('workspace_users')
    .select('*')
    .eq('id', userId)
    .eq('ws_id', wsId)
    .single();

  if (error)
    return NextResponse.json(
      { message: 'Error fetching workspace user' },
      { status: 500 }
    );

  return NextResponse.json(data);
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient();
  const data = await req.json();
  const { wsId, userId } = await params;

  const { error } = await supabase
    .from('workspace_users')
    .update(data)
    .eq('id', userId)
    .eq('ws_id', wsId);

  if (error)
    return NextResponse.json(
      { message: 'Error updating workspace user' },
      { status: 500 }
    );

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId, userId } = await params;

  const { error } = await supabase
    .from('workspace_users')
    .delete()
    .eq('id', userId)
    .eq('ws_id', wsId);

  if (error)
    return NextResponse.json(
      { message: 'Error deleting workspace user' },
      { status: 500 }
    );

  return NextResponse.json({ message: 'success' });
}
