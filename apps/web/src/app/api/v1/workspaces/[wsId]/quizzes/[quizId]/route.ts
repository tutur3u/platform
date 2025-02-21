import { createClient } from '@tutur3u/supabase/next/server';
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
    const { data: existingOptions } = await supabase
      .from('quiz_options')
      .select('id')
      .eq('quiz_id', id);

    const existingOptionIds =
      existingOptions?.map((option: any) => option.id) || [];

    const optionsToUpdate = quiz_options.filter((option: any) =>
      existingOptionIds.includes(option.id)
    );

    const optionsToInsert = quiz_options.filter(
      (option: any) => !existingOptionIds.includes(option.id)
    );

    const optionsToDelete = existingOptionIds.filter(
      (optionId: string) =>
        !quiz_options.some((option: any) => option.id === optionId)
    );

    if (optionsToUpdate.length > 0) {
      await supabase
        .from('quiz_options')
        .upsert(optionsToUpdate.map((o: any) => ({ ...o, quiz_id: id })));
    }

    if (optionsToInsert.length > 0) {
      await supabase
        .from('quiz_options')
        .insert(optionsToInsert.map((o: any) => ({ ...o, quiz_id: id })));
    }

    if (optionsToDelete.length > 0) {
      await supabase.from('quiz_options').delete().in('id', optionsToDelete);
    }
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
