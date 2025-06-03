import { createClient } from '@ncthub/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    tagId: string;
    groupId: string;
  }>;
}

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { tagId, groupId } = await params;

  const { error } = await supabase
    .from('workspace_user_group_tag_groups')
    .delete()
    .eq('tag_id', tagId)
    .eq('group_id', groupId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error removing user group' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
