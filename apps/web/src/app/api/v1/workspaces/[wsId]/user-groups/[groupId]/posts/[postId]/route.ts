import { createClient } from '@ncthub/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    postId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient();
  const data = await req.json();
  const { postId } = await params;

  const { error } = await supabase
    .from('user_group_posts')
    .update(data)
    .eq('id', postId);

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
  const { postId } = await params;

  const { error } = await supabase
    .from('user_group_posts')
    .delete()
    .eq('id', postId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting workspace user group' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
