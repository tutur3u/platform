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
  const { wsId } = await params;
  const body = await req.json();
  const { moduleId, setId, quizzes } = body as {
    moduleId?: string;
    setId?: string;
    quizzes: Array<{
      id?: string;
      question: string;
      quiz_options: Array<{
        id?: string;
        value: string;
        is_correct: boolean;
        explanation?: string | null;
      }>;
    }>;
  };

  try {
    // Process each quiz sequentially (you could also do Promise.all for concurrency)
    for (const quiz of quizzes) {
      let quizId: string;

      if (quiz.id) {
        // existing quiz → update
        const { error: updateErr } = await supabase
          .from('workspace_quizzes')
          .update({ question: quiz.question })
          .eq('id', quiz.id);
        if (updateErr) throw updateErr;
        quizId = quiz.id;
      } else {
        // new quiz → insert
        const { data: inserted, error: insertErr } = await supabase
          .from('workspace_quizzes')
          .insert({ question: quiz.question, ws_id: wsId })
          .select('id')
          .single();
        if (insertErr) throw insertErr;
        quizId = inserted.id;
      }
      // Link to module if provided
      if (moduleId) {
        await supabase.from('course_module_quizzes').insert({
          module_id: moduleId,
          quiz_id: quizId,
        });
      }

      // Link to set if provided
      if (setId) {
        await supabase.from('quiz_set_quizzes').insert({
          set_id: setId,
          quiz_id: quizId,
        });
      }

      // Sync options: simplest is to delete old and re-insert
      await supabase.from('quiz_options').delete().eq('quiz_id', quizId);
      if (quiz.quiz_options.length) {
        const optionsPayload = quiz.quiz_options.map(o => ({
          quiz_id: quizId,
          value: o.value,
          is_correct: o.is_correct,
          explanation: o.explanation ?? null,
        }));
        const { error: optsErr } = await supabase
          .from('quiz_options')
          .insert(optionsPayload);
        if (optsErr) throw optsErr;
      }
    }

    return NextResponse.json({ message: 'All quizzes processed successfully' });
  } catch (error: any) {
    console.error('Bulk quiz error:', error);
    return NextResponse.json(
      { message: error.message || 'An error occurred processing quizzes' },
      { status: 500 }
    );
  }
}