import { createClient } from '@tutur3u/supabase/next/server';
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
    .from('workspace_quiz_sets')
    .select('*')
    .eq('ws_id', id)
    .single();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching workspace quiz sets' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId: id } = await params;

  const { moduleId, quiz_options, ...rest } = await req.json();

  const { data, error } = await supabase
    .from('workspace_quiz_sets')
    .insert({
      ...rest,
      ws_id: id,
    })
    .select('id')
    .single();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating workspace quiz set' },
      { status: 500 }
    );
  }

  if (moduleId) {
    const { error } = await supabase.from('course_module_quiz_sets').insert({
      module_id: moduleId,
      set_id: data.id,
    });

    if (error) {
      console.log(error);
      return NextResponse.json(
        { message: 'Error linking workspace quiz set to course module' },
        { status: 500 }
      );
    }
  }

  if (quiz_options) {
    await supabase
      .from('quiz_options')
      .insert(quiz_options.map((o: any) => ({ ...o, quiz_id: data.id })));
  }

  return NextResponse.json({ message: 'success' });
}
