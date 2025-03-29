import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

/**
 * GET /api/v1/admin/submissions/stats
 * Admin endpoint to fetch statistics about submissions
 */
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id || !user?.email) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { error: roleError } = await supabase
    .from('nova_roles')
    .select('*')
    .eq('email', user.email)
    .eq('allow_challenge_management', true)
    .single();

  if (roleError) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const sbAdmin = await createAdminClient();

  try {
    // Get total count
    const { count: totalCount, error: countError } = await sbAdmin
      .from('nova_submissions')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.error('Error fetching count:', countError);
      return NextResponse.json(
        { message: 'Error fetching submission statistics' },
        { status: 500 }
      );
    }

    // Calculate average score directly
    let averageScore = 0;
    const { data: scores, error: scoresError } = await sbAdmin
      .from('nova_submissions')
      .select('score');

    if (scoresError) {
      console.error('Error fetching scores:', scoresError);
      return NextResponse.json(
        { message: 'Error fetching submission statistics' },
        { status: 500 }
      );
    }

    if (scores && scores.length > 0) {
      const sum = scores.reduce(
        (acc, submission) => acc + (submission.score || 0),
        0
      );
      averageScore = sum / scores.length;
    }

    // Get highest score
    const { data: highestScoreData, error: highestScoreError } = await sbAdmin
      .from('nova_submissions')
      .select('score')
      .order('score', { ascending: false })
      .limit(1)
      .single();

    if (highestScoreError && highestScoreError.code !== 'PGRST116') {
      console.error('Error fetching highest score:', highestScoreError);
      return NextResponse.json(
        { message: 'Error fetching submission statistics' },
        { status: 500 }
      );
    }

    // Get most recent submission date
    const { data: latestSubmission, error: latestError } = await sbAdmin
      .from('nova_submissions')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (latestError && latestError.code !== 'PGRST116') {
      console.error('Error fetching latest submission:', latestError);
      return NextResponse.json(
        { message: 'Error fetching submission statistics' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        totalCount: totalCount || 0,
        averageScore: averageScore || 0,
        highestScore: highestScoreData?.score || 0,
        lastSubmissionDate:
          latestSubmission?.created_at || new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Unexpected Error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
