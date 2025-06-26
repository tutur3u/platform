import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    setId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient();

  // eslint-disable-next-line no-unused-vars
  const { moduleId: _, quiz_options, ...rest } = await req.json();
  const { setId: id } = await params;

  const { error } = await supabase
    .from('workspace_quiz_sets')
    .update(rest)
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating workspace quiz set' },
      { status: 500 }
    );
  }

  if (quiz_options) {
    const { data: existingOptions } = await supabase
      .from('quiz_options')
      .select('id')
      .eq('quiz_id', id);

    const existingOptionIds =
      existingOptions?.map((option: { id: string }) => option.id) || [];

    const optionsToUpdate = quiz_options.filter((option: { id: string }) =>
      existingOptionIds.includes(option.id)
    );

    const optionsToInsert = quiz_options.filter(
      (option: { id?: string }) => !existingOptionIds.includes(option.id || '')
    );

    const optionsToDelete = existingOptionIds.filter(
      (optionId: string) =>
        !quiz_options.some((option: { id: string }) => option.id === optionId)
    );

    if (optionsToUpdate.length > 0) {
      await supabase
        .from('quiz_options')
        .upsert(optionsToUpdate.map((o: { id: string; quiz_id: string }) => ({ ...o, quiz_id: id })));
    }

    if (optionsToInsert.length > 0) {
      await supabase
        .from('quiz_options')
        .insert(optionsToInsert.map((o: { id?: string; quiz_id: string }) => ({ ...o, quiz_id: id })));
    }

    if (optionsToDelete.length > 0) {
      await supabase.from('quiz_options').delete().in('id', optionsToDelete);
    }
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { setId: id } = await params;

  const { error } = await supabase
    .from('workspace_quiz_sets')
    .delete()
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting workspace quiz set' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
