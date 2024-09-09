import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

interface Params {
  params: {
    boardId: string;
  };
}

export async function PUT(req: Request, { params: { boardId: id } }: Params) {
  const supabase = createClient();

  const data = (await req.json()) as {
    name: string;
    color: string;
    group_ids: string[];
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

export async function DELETE(_: Request, { params: { boardId: id } }: Params) {
  const supabase = createClient();

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
