import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

interface Params {
  params: {
    tagId: string;
  };
}

export async function GET(_: Request, { params: { tagId } }: Params) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('workspace_user_group_tag_groups')
    .select('*', {
      count: 'exact',
    })
    .eq('tag_id', tagId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching user groups' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function POST(req: Request, { params: { tagId } }: Params) {
  const supabase = createClient();

  const data = (await req.json()) as {
    groupIds: string[];
  };

  if (!data?.groupIds)
    return NextResponse.json({ message: 'Invalid request' }, { status: 400 });

  const { error: tagError } = await supabase
    .from('workspace_user_group_tag_groups')
    .insert(
      data.groupIds.map((groupId) => ({
        group_id: groupId,
        tag_id: tagId,
      }))
    );

  if (tagError) {
    console.log(tagError);
    return NextResponse.json(
      { message: 'Error adding new groups to tag' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}