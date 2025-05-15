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
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

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

  if (authError || !user?.id || !user?.email) {
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

    const { canSubmit, remainingAttempts, message } =
      await checkUserPermissions({
        problemId: validatedData.problemId,
        sessionId: validatedData.sessionId,
      });

    if (!canSubmit) {
      return NextResponse.json({ message }, { status: 401 });
    }

    const submissionData = {
      prompt: validatedData.prompt,
      problem_id: validatedData.problemId,
      session_id: validatedData.sessionId,
      user_id: user.id,
    };

    const { data: submission, error: submissionError } = await supabase
      .from('nova_submissions')
      .insert(submissionData)
      .select('*')
      .single();

    if (submissionError) {
      console.error('Database Error: ', submissionError);
      return NextResponse.json(
        { message: 'Error creating submission' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { ...submission, remainingAttempts },
      { status: 201 }
    );
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

async function checkUserPermissions({
  problemId,
  sessionId,
}: {
  problemId: string;
  sessionId: string | null;
}) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id || !user?.email) {
    return {
      canSubmit: false,
      remainingAttempts: 0,
      message: 'Unauthorized',
    };
  }

  // Check if the user is an admin
  const { data: roleData, error: roleError } = await supabase
    .from('nova_roles')
    .select('*')
    .eq('email', user.email)
    .eq('allow_challenge_management', true)
    .single();

  if (roleError && roleError.code !== 'PGRST116') {
    console.error('Database Error when checking role:', roleError);
    return {
      canSubmit: false,
      remainingAttempts: 0,
      message: 'Error checking user permissions',
    };
  }

  const isAdmin = roleData && roleData.allow_challenge_management;

  // Admin users can always submit without restrictions
  if (isAdmin) {
    return { canSubmit: true, remainingAttempts: Infinity, message: null };
  }

  // For non-admin users, validate session and submission count
  if (!sessionId) {
    return {
      canSubmit: false,
      remainingAttempts: 0,
      message: 'sessionId is required for non-admin users',
    };
  }

  // Check if the session is in progress
  const { data: sessionData, error: sessionError } = await supabase
    .from('nova_sessions')
    .select('*, ...nova_challenges!inner(duration, close_at)')
    .eq('id', sessionId)
    .single();

  if (sessionError) {
    console.error('Database Error when checking session:', sessionError);
    return {
      canSubmit: false,
      remainingAttempts: 0,
      message: 'Error fetching session data',
    };
  }

  const sessionEndTime = Math.min(
    sessionData.close_at ? new Date(sessionData.close_at).getTime() : Infinity,
    new Date(sessionData.start_time).getTime() + sessionData.duration * 1000
  );

  const currentTime = new Date().getTime();

  if (currentTime > sessionEndTime) {
    return {
      canSubmit: false,
      remainingAttempts: 0,
      message: 'Session has ended',
    };
  }

  // Check submission count
  const { error: countError, count } = await supabase
    .from('nova_submissions')
    .select('*', { count: 'exact', head: true })
    .eq('problem_id', problemId)
    .eq('session_id', sessionId)
    .eq('user_id', user.id);

  if (countError) {
    console.error('Database Error when counting submissions:', countError);
    return {
      canSubmit: false,
      remainingAttempts: 0,
      message: 'Error checking submission count',
    };
  }

  const maxAttempts = 3;
  const submissionCount = count || 0;
  const remainingAttempts = maxAttempts - submissionCount;

  if (submissionCount >= maxAttempts) {
    return {
      canSubmit: false,
      remainingAttempts: 0,
      message: 'You have reached the maximum of 3 submissions.',
    };
  }

  return {
    canSubmit: true,
    remainingAttempts,
    message: null,
  };
}
