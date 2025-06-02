import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    groupId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient();
  const data = await req.json();
  const { groupId } = await params;

  const { error } = await supabase
    .from('workspace_user_groups')
    .update(data)
    .eq('id', groupId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating workspace user group' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { groupId } = await params;

  const { error } = await supabase
    .from('workspace_user_groups')
    .delete()
    .eq('id', groupId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting workspace user group' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
