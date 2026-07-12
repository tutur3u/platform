import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

export async function GET(request: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId: id } = await params;

  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim();
  const page = Math.max(
    Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1,
    1
  );
  const pageSize = Math.min(
    Math.max(
      Number.parseInt(
        url.searchParams.get('pageSize') ?? `${DEFAULT_PAGE_SIZE}`,
        10
      ) || DEFAULT_PAGE_SIZE,
      1
    ),
    MAX_PAGE_SIZE
  );

  const queryBuilder = supabase
    .from('workspace_user_group_tags')
    .select('*, group_ids:workspace_user_group_tag_groups(group_id)', {
      count: 'exact',
    })
    .eq('ws_id', id)
    .order('created_at', { ascending: false });

  if ((q?.length ?? 0) > 0) {
    queryBuilder.ilike('name', `%${q}%`);
  }

  const from = (page - 1) * pageSize;
  queryBuilder.range(from, from + pageSize - 1);

  const { data, error, count } = await queryBuilder;

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching workspace user group tags' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: (data ?? []).map(({ group_ids, ...tag }) => ({
      ...tag,
      group_ids: (group_ids ?? []).map(
        (group: { group_id: string }) => group.group_id
      ),
    })),
    count: count ?? 0,
    page,
    pageSize,
  });
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
