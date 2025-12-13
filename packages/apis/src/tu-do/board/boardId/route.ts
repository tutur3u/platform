import { createClient } from '@tuturuuu/supabase/next/server';
import type { Database } from '@tuturuuu/types';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    boardId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { boardId: id } = await params;

  const data = (await req.json()) as {
    name?: string;
    icon?: Database['public']['Enums']['workspace_board_icon'] | null;
    color?: string;
    group_ids?: string[];
  };

  const { group_ids: _, ...coreData } = data;

  const { error } = await supabase
    .from('workspace_boards')
    .update(coreData)
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating workspace board' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { boardId: id } = await params;

  const { error } = await supabase
    .from('workspace_boards')
    .delete()
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting workspace board' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
