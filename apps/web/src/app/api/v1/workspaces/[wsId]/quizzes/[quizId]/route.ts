import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    quizId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient();

  // eslint-disable-next-line no-unused-vars
  const { moduleId: _, quiz_options, ...rest } = await req.json();
  const { quizId: id } = await params;

  const { error } = await supabase
    .from('workspace_quizzes')
    .update(rest)
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating workspace quiz' },
      { status: 500 }
    );
  }

  if (quiz_options) {
    await supabase
      .from('quiz_options')
      .upsert(quiz_options.map((o: any) => ({ ...o, quiz_id: id })));
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { quizId: id } = await params;

  const { error } = await supabase
    .from('workspace_quizzes')
    .delete()
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting workspace quiz' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
