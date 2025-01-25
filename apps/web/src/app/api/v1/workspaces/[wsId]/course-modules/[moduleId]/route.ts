import { createClient } from '@repo/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    moduleId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient();
  const data = await req.json();
  const { moduleId: id } = await params;

  const { error } = await supabase
    .from('workspace_course_modules')
    .update(data)
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating workspace course module' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { moduleId: id } = await params;

  const { error } = await supabase
    .from('workspace_course_modules')
    .delete()
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting workspace course module' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
