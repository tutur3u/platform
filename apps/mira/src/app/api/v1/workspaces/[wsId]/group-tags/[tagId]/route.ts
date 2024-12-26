import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    tagId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { tagId: id } = await params;

  const data = (await req.json()) as {
    name: string;
    color: string;
    group_ids: string[];
  };

  const { group_ids: _, ...coreData } = data;

  const { error } = await supabase
    .from('workspace_user_group_tags')
    .update(coreData)
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating workspace user group tag' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { tagId: id } = await params;

  const { error } = await supabase
    .from('workspace_user_group_tags')
    .delete()
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting workspace user group tag' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
