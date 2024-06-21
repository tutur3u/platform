import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

interface Params {
  params: {
    wsId: string;
    userId: string;
  };
}

export async function GET(
  _: Request,
  { params: { wsId, userId: id } }: Params
) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('workspace_users')
    .select('*')
    .eq('id', id)
    .eq('ws_id', wsId)
    .single();

  if (error)
    return NextResponse.json(
      { message: 'Error fetching workspace user' },
      { status: 500 }
    );

  return NextResponse.json(data);
}

export async function DELETE(
  _: Request,
  { params: { wsId, userId: id } }: Params
) {
  const supabase = createClient();

  const { error } = await supabase
    .from('workspace_users')
    .delete()
    .eq('id', id)
    .eq('ws_id', wsId);

  if (error)
    return NextResponse.json(
      { message: 'Error deleting workspace user' },
      { status: 500 }
    );

  return NextResponse.json({ message: 'success' });
}
