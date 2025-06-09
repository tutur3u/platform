import { createClient } from '@tuturuuu/supabase/next/server';
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

  const { moduleId, name, quiz_options, ...rest } = await req.json();
  // Quiz set name validation
  if (!name || name.trim().length === 0) {
    return NextResponse.json(
      { message: 'Quiz set name is required' },
      { status: 400 }
    );
  }
  const formattedName = name.trim();
  const { data: quizSetName, error: quizSetNameError } = await supabase
    .from('workspace_quiz_sets')
    .select('name')
    .eq('ws_id', id)
    .eq('name', `${formattedName}%`);

  if (quizSetNameError) {
    console.log(quizSetNameError);
    return NextResponse.json(
      { message: 'Error fetching workspace quiz set name' },
      { status: 500 }
    );
  }
  let renderedName = '';
  if (!quizSetName || quizSetName.length === 0) {
    renderedName = formattedName;
  } else {
    const existingNames = quizSetName.map((d) => d.name);
    const baseName = formattedName;
    let suffix = 2;
    let newName = `${baseName} ${suffix}`;
    while (existingNames.includes(newName)) {
      suffix++;
      newName = `${baseName} ${suffix}`;
    }
    renderedName = newName;
  }

  const { data, error } = await supabase
    .from('workspace_quiz_sets')
    .insert({
      ...rest,
      name: renderedName,
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

  return NextResponse.json({
    message: 'success',
    setId: data.id,
    name: renderedName,
  });
}
