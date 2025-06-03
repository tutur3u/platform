import { createClient } from '@ncthub/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    courseId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { courseId: id } = await params;

  const { data, error } = await supabase
    .from('workspace_course_modules')
    .select('*')
    .eq('course_id', id)
    .single();

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
  const { courseId: id } = await params;

  const data = await req.json();

  const { error } = await supabase.from('workspace_course_modules').insert({
    ...data,
    course_id: id,
  });

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating workspace course module' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
