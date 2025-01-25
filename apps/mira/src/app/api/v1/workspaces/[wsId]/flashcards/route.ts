import { createClient } from '@repo/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId: id } = await params;

  const { data, error } = await supabase
    .from('workspace_flashcards')
    .select('*')
    .eq('ws_id', id)
    .single();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching workspace flashcards' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId: id } = await params;

  const { moduleId, ...rest } = await req.json();

  const { data, error } = await supabase
    .from('workspace_flashcards')
    .insert({
      ...rest,
      ws_id: id,
    })
    .select('id')
    .single();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating workspace flashcard' },
      { status: 500 }
    );
  }

  if (moduleId) {
    await supabase.from('course_module_flashcards').insert({
      module_id: moduleId,
      flashcard_id: data.id,
    });
  }

  return NextResponse.json({ message: 'success' });
}
