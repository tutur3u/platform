import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId: id } = await params;

  const { data, error } = await supabase
    .from('workspace_user_group_tags')
    .select('*')
    .eq('ws_id', id)
    .single();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching workspace user group tags' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId: id } = await params;

  const data = (await req.json()) as {
    name: string;
    color: string;
    group_ids: string[];
  };

  const { group_ids, ...coreData } = data;

  const { data: tag, error: tagError } = await supabase
    .from('workspace_user_group_tags')
    .insert({
      ...coreData,
      ws_id: id,
    })
    .select('id')
    .single();

  if (tagError) {
    console.log(tagError);
    return NextResponse.json(
      { message: 'Error creating workspace user group tag' },
      { status: 500 }
    );
  }

  const { error: groupError } =
    group_ids && group_ids.length > 0
      ? await supabase.from('workspace_user_group_tag_groups').insert(
          group_ids.map((group_id) => ({
            tag_id: tag.id,
            group_id,
          }))
        )
      : { error: null };

  if (groupError) {
    console.log(groupError);
    return NextResponse.json(
      { message: 'Error creating workspace user group tag groups' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
