import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

interface Params {
  params: {
    groupId: string;
  };
}

export async function PUT(req: Request, { params: { groupId: id } }: Params) {
  const supabase = createClient();
  const data = await req.json();

  const { error } = await supabase
    .from('workspace_user_groups')
    .update(data)
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating workspace user group' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(_: Request, { params: { groupId: id } }: Params) {
  const supabase = createClient();

  const { error } = await supabase
    .from('workspace_user_groups')
    .delete()
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting workspace user group' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
