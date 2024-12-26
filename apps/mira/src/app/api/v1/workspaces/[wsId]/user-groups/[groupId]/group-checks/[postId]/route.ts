import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  const supabase = await createClient();
  const data = await req.json();
  const { postId } = await params;

  const multiple = Array.isArray(data);

  if (multiple) {
    const { error } = await supabase
      .from('user_group_post_checks')
      .upsert(data)
      .eq('post_id', postId);

    if (error) {
      console.error('Error updating user_group_post_checks:', error.message);
      return NextResponse.json(
        {
          message: 'Error updating user_group_post_checks',
          details: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'Data updated successfully' });
  } else {
    const deleteData = data?.is_completed == null;

    const { error } = deleteData
      ? await supabase
          .from('user_group_post_checks')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', data.user_id)
      : await supabase
          .from('user_group_post_checks')
          .upsert({
            post_id: postId,
            user_id: data.user_id,
            notes: data.notes,
            is_completed: data.is_completed,
            created_at: data.created_at,
          })
          .eq('post_id', postId)
          .eq('user_id', data.user_id);

    if (error) {
      console.error('Error updating user_group_post_checks:', error.message);
      return NextResponse.json(
        {
          message: 'Error updating user_group_post_checks',
          details: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'Data updated successfully' });
  }
}
