import { createClient } from '@tutur3u/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    flashcardId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient();

  // eslint-disable-next-line no-unused-vars
  const { moduleId: _, ...rest } = await req.json();
  const { flashcardId: id } = await params;

  const { error } = await supabase
    .from('workspace_flashcards')
    .update(rest)
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating workspace flashcard' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { flashcardId: id } = await params;

  const { error } = await supabase
    .from('workspace_flashcards')
    .delete()
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting workspace flashcard' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
