import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

/**
 * GET /api/v1/admin/submissions/stats
 * Admin endpoint to fetch statistics about submissions with filtering support
 */
export async function GET(request: Request) {
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
  const { searchParams } = new URL(request.url);

  // Get filter parameters
  const challengeId = searchParams.get('challengeId') || null;
  const problemId = searchParams.get('problemId') || null;
  const search = searchParams.get('search') || '';

  console.log('Stats API request with params:', {
    challengeId,
    problemId,
    search,
  });

  try {
    // First, fetch all matched submissions to use for all stats calculations
    let matchedSubmissions = [];

    // Step 1: Handle the challenge filter by getting problem IDs first
    if (challengeId) {
      // Get all problems for this challenge
      const { data: problems } = await sbAdmin
        .from('nova_problems')
        .select('id')
        .eq('challenge_id', challengeId);

      if (!problems || problems.length === 0) {
        // No problems found for this challenge, return empty stats
        console.log('No problems found for challenge:', challengeId);
        return emptyStats();
      }

      // Get all submissions for these problems
      const problemIds = problems.map((p) => p.id);
      console.log('Found problems for challenge:', problemIds);

      const { data: submissions } = await sbAdmin
        .from('nova_submissions_with_scores')
        .select('*')
        .in('problem_id', problemIds);

      matchedSubmissions = submissions || [];
    }
    // Step 2: Handle problem filter
    else if (problemId) {
      const { data: submissions } = await sbAdmin
        .from('nova_submissions_with_scores')
        .select('*')
        .eq('problem_id', problemId);

      matchedSubmissions = submissions || [];
    }
    // Step 3: If no problem or challenge filter, get all submissions
    else {
      const { data: submissions } = await sbAdmin
        .from('nova_submissions_with_scores')
        .select('*');

      matchedSubmissions = submissions || [];
    }

    // Step 4: Apply search filter if provided
    if (search && matchedSubmissions.length > 0) {
      const searchLower = search.toLowerCase();
      matchedSubmissions = matchedSubmissions.filter((submission) =>
        submission.prompt?.toLowerCase().includes(searchLower)
      );
    }

    console.log(
      `Found ${matchedSubmissions.length} matching submissions after all filters`
    );

    // If no matching submissions, return empty stats
    if (matchedSubmissions.length === 0) {
      return emptyStats();
    }

    // Calculate stats from the filtered submissions
    // 1. Total count
    const totalCount = matchedSubmissions.length;

    // 2. Average score
    const totalScore = matchedSubmissions.reduce(
      (sum, sub) => sum + (sub.total_score || 0),
      0
    );
    const averageScore = totalScore / totalCount;

    // 3. Highest score
    const highestScore = Math.max(
      ...matchedSubmissions.map((sub) => sub.total_score || 0)
    );

    // 4. Latest submission date
    const latestDate = new Date(
      Math.max(
        ...matchedSubmissions
          .filter((sub) => sub.created_at !== null)
          .map((sub) => new Date(sub.created_at as string).getTime())
      )
    ).toISOString();

    return NextResponse.json(
      {
        totalCount,
        averageScore,
        highestScore,
        lastSubmissionDate: latestDate,
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

// Helper function to return empty stats
function emptyStats() {
  return NextResponse.json(
    {
      totalCount: 0,
      averageScore: 0,
      highestScore: 0,
      lastSubmissionDate: new Date().toISOString(),
    },
    { status: 200 }
  );
}
