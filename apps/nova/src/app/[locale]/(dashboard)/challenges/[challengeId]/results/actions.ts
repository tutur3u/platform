'use server';

import { createAdminClient } from '@tuturuuu/supabase/next/server';

export async function fetchSessionDetails(
  sessionId: string,
  challengeId: string
) {
  const sbAdmin = await createAdminClient();

  try {
    // Get session data
    const { data: session } = await sbAdmin
      .from('nova_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (!session) {
      throw new Error('Session not found');
    }

    // Get problems for this challenge
    const { data: problems } = await sbAdmin
      .from('nova_problems')
      .select(
        `
      *,
      submissions:nova_submissions_with_scores(
        *,
        criteria:nova_challenge_criteria(
          *,
          results:nova_submission_criteria(*)
        )
      )
    `
      )
      .eq('challenge_id', challengeId);

    if (!problems) {
      throw new Error('Problems not found');
    }

    // Filter submissions to only include those for this session
    const sessionProblems = problems.map((problem) => {
      return {
        ...problem,
        submissions: problem.submissions
          .filter((sub) => sub.session_id === sessionId)
          .map((submission) => {
            // Map criteria to expected format
            const criteria = submission.criteria.map((criterion) => ({
              ...criterion,
              results: undefined,
              result: criterion.results.find(
                (result) => result.submission_id === submission.id
              ),
            }));

            return {
              ...submission,
              total_tests: submission.total_tests || 0,
              passed_tests: submission.passed_tests || 0,
              test_case_score: submission.test_case_score || 0,
              criteria,
              total_criteria: submission.total_criteria || 0,
              sum_criterion_score: submission.sum_criterion_score || 0,
              criteria_score: submission.criteria_score || 0,
              total_score: submission.total_score || 0,
            };
          }),
      };
    });

    // Return the session with problems attached
    return {
      ...session,
      problems: sessionProblems,
    };
  } catch (error) {
    console.error('Error fetching session details:', error);
    throw error;
  }
}

export async function fetchAllProblems(challengeId: string, userId: string) {
  const sbAdmin = await createAdminClient();

  try {
    // Get all problems for this challenge
    const { data: problems, error: problemsError } = await sbAdmin
      .from('nova_problems')
      .select(`*`)
      .eq('challenge_id', challengeId);

    if (problemsError) {
      throw new Error(`Failed to fetch problems`);
    }

    // Get all sessions for this user and challenge
    const { data: sessions } = await sbAdmin
      .from('nova_sessions')
      .select('id')
      .eq('challenge_id', challengeId)
      .eq('user_id', userId);

    if (!sessions || sessions.length === 0) {
      return { problems: problems.map((p) => ({ ...p, submissions: [] })) };
    }

    const sessionIds = sessions.map((s) => s.id);

    // Get all submissions for these problems across all sessions
    const { data: allSubmissions } = await sbAdmin
      .from('nova_submissions_with_scores')
      .select(
        `*,
          criteria:nova_challenge_criteria(
          *,
          results:nova_submission_criteria(*)
         )`
      )
      .in('session_id', sessionIds);

    // Group submissions by problem_id
    const submissionsByProblem: Record<string, any[]> = {};

    // Check if we have submissions
    if (allSubmissions && allSubmissions.length > 0) {
      allSubmissions?.forEach((submission) => {
        if (!submission.problem_id) {
          console.warn('Found submission without problem_id:', submission.id);
          return; // Skip this iteration
        }

        if (!submissionsByProblem[submission.problem_id]) {
          submissionsByProblem[submission.problem_id] = [];
        }

        // Format criteria as you did in fetchSessionDetails
        const criteria = submission.criteria.map((criterion: any) => ({
          ...criterion,
          results: undefined,
          result: criterion.results.find(
            (result: any) => result.submission_id === submission.id
          ),
        }));

        submissionsByProblem[submission.problem_id]!.push({
          ...submission,
          total_tests: submission.total_tests || 0,
          passed_tests: submission.passed_tests || 0,
          test_case_score: submission.test_case_score || 0,
          criteria,
          total_criteria: submission.total_criteria || 0,
          sum_criterion_score: submission.sum_criterion_score || 0,
          criteria_score: submission.criteria_score || 0,
          total_score: submission.total_score || 0,
        });
      });
    }

    const problemsWithSubmissions = problems.map((problem) => ({
      ...problem,
      submissions: submissionsByProblem[problem.id] || [],
    }));

    return { problems: problemsWithSubmissions };
  } catch (error) {
    console.error('Error fetching all problems:', error);
    throw error;
  }
}
