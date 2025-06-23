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

type OptionPayload = {
  id?: string;
  value: string;
  is_correct: boolean;
  explanation?: string | null;
};
type QuizPayload = {
  id?: string;
  question: string;
  quiz_options: OptionPayload[];
};
type BulkBody = {
  moduleId?: string;
  setId?: string;
  quizzes: QuizPayload[];
};

export async function POST(
  request: Request,
  { params }: Params
) {
  const { wsId } = await params;
  const sb = await createClient();

  let body: BulkBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { moduleId, setId, quizzes } = body;
  if (!Array.isArray(quizzes)) {
    return NextResponse.json(
      { error: '`quizzes` must be an array' },
      { status: 400 }
    );
  }

  try {
    const created: string[] = [];

    for (const quiz of quizzes) {
      if (quiz.id) continue; // skip those that already have an id

      // 1) insert workspace_quizzes
      const { data: insQ, error: insQErr } = await sb
        .from('workspace_quizzes')
        .insert({ question: quiz.question, ws_id: wsId })
        .select('id')
        .single();
      if (insQErr || !insQ) throw insQErr || new Error('Could not create quiz');
      const quizId = insQ.id;
      created.push(quizId);

      // 2) link to module & set
      if (moduleId) {
        await sb
          .from('course_module_quizzes')
          .insert({ module_id: moduleId, quiz_id: quizId });
      }
      if (setId) {
        await sb
          .from('quiz_set_quizzes')
          .insert({ set_id: setId, quiz_id: quizId });
      }

      // 3) insert quiz_options
      if (Array.isArray(quiz.quiz_options) && quiz.quiz_options.length) {
        await sb.from('quiz_options').insert(
          quiz.quiz_options.map((opt) => ({
            quiz_id: quizId,
            value: opt.value,
            is_correct: opt.is_correct,
            explanation: opt.explanation ?? null,
          }))
        );
      }
    }

    return NextResponse.json({
      message: `Created ${created.length} new quiz${created.length === 1 ? '' : 'zes'}`,
      created,
    });
  } catch (err: any) {
    console.error('Bulk-create error:', err);
    return NextResponse.json(
      { error: err.message || 'Unknown error creating quizzes' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: Params
) {
  const { wsId } = await params;
  const sb = await createClient();

  let body: BulkBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { moduleId, setId, quizzes } = body;
  if (!Array.isArray(quizzes)) {
    return NextResponse.json(
      { error: '`quizzes` must be an array' },
      { status: 400 }
    );
  }

  try {
    for (const quiz of quizzes) {
      let quizId: string;

      // ── 1) Upsert workspace_quizzes ───────────────────────────
      if (quiz.id) {
        // existing → update
        await sb
          .from('workspace_quizzes')
          .update({ question: quiz.question })
          .eq('id', quiz.id);
        quizId = quiz.id;
      } else {
        // new → insert
        const { data: ins, error: insErr } = await sb
          .from('workspace_quizzes')
          .insert({ question: quiz.question, ws_id: wsId })
          .select('id')
          .single();
        if (insErr || !ins) throw insErr || new Error('Could not create quiz');
        quizId = ins.id;
      }

      // ── 2) Link to module & set ─────────────────────────────
      if (moduleId) {
        await sb
          .from('course_module_quizzes')
          .upsert({ module_id: moduleId, quiz_id: quizId });
      }
      if (setId) {
        await sb
          .from('quiz_set_quizzes')
          .upsert({ set_id: setId, quiz_id: quizId });
      }

      // ── 3) Sync quiz_options ────────────────────────────────
      const incomingIds = quiz.quiz_options
        .filter((o) => o.id)
        .map((o) => o.id!);

      // delete any missing
      await sb
        .from('quiz_options')
        .delete()
        .eq('quiz_id', quizId)
        .not('id', 'in', `(${incomingIds.map((id) => `'${id}'`).join(',')})`);

      // upsert each
      for (const opt of quiz.quiz_options) {
        if (opt.id) {
          // update
          await sb
            .from('quiz_options')
            .update({
              value: opt.value,
              is_correct: opt.is_correct,
              explanation: opt.explanation ?? null,
            })
            .eq('id', opt.id);
        } else {
          // insert
          await sb.from('quiz_options').insert({
            quiz_id: quizId,
            value: opt.value,
            is_correct: opt.is_correct,
            explanation: opt.explanation ?? null,
          });
        }
      }
    }

    return NextResponse.json({ message: 'All quizzes upserted successfully' });
  } catch (err: any) {
    console.error('Bulk-upsert error:', err);
    return NextResponse.json(
      { error: err.message || 'Unknown error updating quizzes' },
      { status: 500 }
    );
  }
}
