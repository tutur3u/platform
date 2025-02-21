import { createClient } from '@tutur3u/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    groupId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { groupId } = await params;

  const { data, error } = await supabase
    .from('user_group_posts')
    .select('*')
    .eq('group_id', groupId)
    .single();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching workspace user groups' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();
  const data = await req.json();
  const { groupId } = await params;

  const { error } = await supabase.from('user_group_posts').insert({
    ...data,
    group_id: groupId,
  });

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating group post' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
