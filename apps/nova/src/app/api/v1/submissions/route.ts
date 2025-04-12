import { createSubmissionSchema } from '../schemas';
import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const problemId = searchParams.get('problemId');
  const sessionId = searchParams.get('sessionId');

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    let query = supabase
      .from('nova_submissions')
      .select('*')
      .eq('user_id', user.id);

    if (problemId) {
      query = query.eq('problem_id', problemId);
    }

    if (sessionId) {
      query = query.eq('session_id', sessionId);
    }

    const { data: submissions, error } = await query;

    if (error) {
      console.error('Database Error: ', error);
      return NextResponse.json(
        { message: 'Error fetching submissions' },
        { status: 500 }
      );
    }

    return NextResponse.json(submissions, { status: 200 });
  } catch (error) {
    console.error('Unexpected Error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  let body;

  try {
    body = await request.json();
  } catch (error) {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }

  try {
    // Validate request body with Zod
    const validatedData = createSubmissionSchema.parse(body);

    const submissionData = {
      prompt: validatedData.prompt,
      feedback: validatedData.feedback,
      score: validatedData.score,
      problem_id: validatedData.problemId,
      session_id: validatedData.sessionId,
      user_id: user.id,
    };

    const { data: submission, error: submissionError } = await supabase
      .from('nova_submissions')
      .insert(submissionData)
      .select()
      .single();

    if (submissionError) {
      console.error('Database Error: ', submissionError);
      return NextResponse.json(
        { message: 'Error creating submission' },
        { status: 500 }
      );
    }

    return NextResponse.json(submission, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      // Zod validation error
      return NextResponse.json(
        { message: 'Validation error', errors: error.errors },
        { status: 400 }
      );
    }

    console.error('Unexpected Error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
