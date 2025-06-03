import { createClient } from '@ncthub/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    courseId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient();
  const data = await req.json();
  const { courseId: id } = await params;

  const { error } = await supabase
    .from('workspace_courses')
    .update(data)
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating workspace course' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { courseId: id } = await params;

  const { error } = await supabase
    .from('workspace_courses')
    .delete()
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting workspace course' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
