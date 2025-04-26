import type { ResponseMode } from '@tuturuuu/ai/types';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';
export const maxDuration = 60;
export const preferredRegion = 'sin1';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ problemId: string }> }
) {
  const supabase = createClient();
  const sbAdmin = await createAdminClient();

  try {
    const { prompt, sessionId } = (await req.json()) as {
      id?: string;
      model?: string;
      prompt?: string;
      sessionId?: string;
      mode?: ResponseMode;
    };

    const {
      data: { user },
    } = await (await supabase).auth.getUser();

    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    if (!prompt) {
      return NextResponse.json(
        { message: 'Incomplete data provided' },
        { status: 400 }
      );
    }

    const { problemId } = await params;

    if (!problemId) {
      return NextResponse.json(
        { message: 'Incomplete data provided' },
        { status: 400 }
      );
    }

    const { data: problem, error: problemError } = await sbAdmin
      .from('nova_problems')
      .select('*')
      .eq('id', problemId)
      .single();

    if (problemError) {
      return NextResponse.json(
        { message: 'Error fetching problem' },
        { status: 500 }
      );
    }

    if (prompt.length > problem.max_prompt_length) {
      return NextResponse.json(
        { message: 'Prompt is too long' },
        { status: 400 }
      );
    }

    // Step 3: Create the submission record
    const { data: submission, error: submissionError } = await sbAdmin
      .from('nova_submissions')
      .insert({
        prompt,
        problem_id: problemId,
        session_id: sessionId,
        user_id: user.id,
      })
      .select('id')
      .single();

    if (submissionError) {
      console.error('Submission error:', submissionError);
      return NextResponse.json(
        { message: 'Failed to create submission record' },
        { status: 500 }
      );
    }

    // Step 6: Return the evaluation results and submission ID
    return NextResponse.json(
      {
        submissionId: submission.id,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('🚨 Server error:', error);

    return NextResponse.json(
      { message: `Internal server error: ${error.message}` },
      { status: 500 }
    );
  }
}
