import { createClient } from '@ncthub/supabase/next/server';
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
    .from('workspace_quizzes')
    .select('*')
    .eq('ws_id', id)
    .single();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching workspace quizzes' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId: id } = await params;

  const { moduleId, setId, quiz_options, ...rest } = await req.json();

  const { data, error } = await supabase
    .from('workspace_quizzes')
    .insert({
      ...rest,
      ws_id: id,
    })
    .select('id')
    .single();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating workspace quiz' },
      { status: 500 }
    );
  }

  if (moduleId) {
    await supabase.from('course_module_quizzes').insert({
      module_id: moduleId,
      quiz_id: data.id,
    });
  }

  if (setId) {
    await supabase.from('quiz_set_quizzes').insert({
      set_id: setId,
      quiz_id: data.id,
    });
  }

  if (quiz_options) {
    await supabase
      .from('quiz_options')
      .insert(quiz_options.map((o: any) => ({ ...o, quiz_id: data.id })));
  }

  return NextResponse.json({ message: 'success' });
}
