import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    groupId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { groupId: id } = await params;

  const { data, error } = await supabase
    .from('workspace_course_modules')
    .select('*')
    .eq('group_id', id)
    .order('sort_key', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching workspace course modules' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { groupId: id } = await params;

  const data = await req.json();

  const { data: module, error } = await supabase
    .from('workspace_course_modules')
    .insert({
      ...data,
      group_id: id,
    })
    .select('*')
    .single();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating workspace course module' },
      { status: 500 }
    );
  }

  return NextResponse.json(module);
}
