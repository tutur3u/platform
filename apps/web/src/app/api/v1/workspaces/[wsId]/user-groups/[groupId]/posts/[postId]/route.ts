import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

interface Params {
  params: {
    postId: string;
  };
}

export async function PUT(req: Request, { params: { postId } }: Params) {
  const supabase = createClient();
  const data = await req.json();

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

export async function DELETE(_: Request, { params: { postId } }: Params) {
  const supabase = createClient();

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
