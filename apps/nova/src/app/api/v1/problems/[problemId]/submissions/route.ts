import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    problemId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { problemId } = await params;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  // Get the problem to find the challenge_id
  const { data: problem, error: problemError } = await supabase
    .from('nova_problems')
    .select('challenge_id')
    .eq('id', problemId)
    .single();

  if (problemError) {
    return NextResponse.json(
      { message: 'Error fetching problem' },
      { status: 500 }
    );
  }

  // Get the criteria for the challenge
  const { data: criteria, error: criteriaError } = await supabase
    .from('nova_challenge_criteria')
    .select('*')
    .eq('challenge_id', problem.challenge_id);

  if (criteriaError) {
    return NextResponse.json(
      { message: 'Error fetching criteria' },
      { status: 500 }
    );
  }

  // Get submissions with criteria scores
  const { data: submissions, error } = await supabase
    .from('nova_submissions')
    .select('*')
    .eq('problem_id', problemId)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json(
      { message: 'Error fetching submissions' },
      { status: 500 }
    );
  }

  // Get criteria scores for each submission
  const submissionsWithScores = await Promise.all(
    submissions.map(async (submission) => {
      const { data: criteriaScores, error: scoresError } = await supabase
        .from('nova_problem_criteria_scores')
        .select('*')
        .eq('problem_id', problemId);

      if (scoresError) {
        console.error('Error fetching criteria scores:', scoresError);
        return submission;
      }

      // Map criteria details to scores
      const criteriaScoresWithDetails = criteriaScores.map((score) => {
        const criteriaDetail = criteria.find((c) => c.id === score.criteria_id);
        return {
          ...score,
          criteria: criteriaDetail,
        };
      });

      return {
        ...submission,
        criteria_scores: criteriaScoresWithDetails,
      };
    })
  );

  return NextResponse.json(submissionsWithScores);
}

export async function POST(request: Request, { params }: Params) {
  const supabase = await createClient();
  const { prompt, feedback, score, criteriaScores } = await request.json();
  const { problemId } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  if (!prompt || !feedback || score === undefined) {
    return NextResponse.json(
      { message: 'Prompt, feedback, and score are required' },
      { status: 400 }
    );
  }

  // Insert the new submission into the `nova_submissions` table
  const { error: insertError } = await supabase
    .from('nova_submissions')
    .insert({
      prompt: prompt,
      feedback: feedback,
      score: score,
      problem_id: problemId,
      user_id: user.id,
    });

  if (insertError) {
    console.error('Error creating submission:', insertError);
    return NextResponse.json(
      { message: 'Error creating submission' },
      { status: 500 }
    );
  }

  // If criteria scores are provided, insert them
  if (
    criteriaScores &&
    Array.isArray(criteriaScores) &&
    criteriaScores.length > 0
  ) {
    const criteriaScoresToInsert = criteriaScores.map((cs) => ({
      problem_id: problemId,
      criteria_id: cs.criteria_id,
      score: cs.score,
    }));

    const { error: criteriaScoresError } = await supabase
      .from('nova_problem_criteria_scores')
      .insert(criteriaScoresToInsert);

    if (criteriaScoresError) {
      console.error('Error inserting criteria scores:', criteriaScoresError);
      // Continue anyway, as the main submission was successful
    }
  }

  const { data: problem, error: problemError } = await supabase
    .from('nova_problems')
    .select('*')
    .eq('id', problemId)
    .single();

  if (problemError) {
    console.error('Error fetching problem:', problemError);
    return NextResponse.json(
      { message: 'Error fetching problem' },
      { status: 500 }
    );
  }

  const { error: rpcError } = await supabase.rpc('update_session_total_score', {
    challenge_id_param: problem?.challenge_id as never,
    user_id_param: user.id as never,
  });

  if (rpcError) {
    console.error('Error updating total score:', rpcError);
    return NextResponse.json(
      { message: 'Error updating total score' },
      { status: 500 }
    );
  }

  return NextResponse.json('Submission created and total score updated', {
    status: 201,
  });
}
