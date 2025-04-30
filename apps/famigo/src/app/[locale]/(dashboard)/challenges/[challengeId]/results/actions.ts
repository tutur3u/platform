'use server';

import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type {
  NovaProblem,
  NovaSession,
  NovaSubmissionCriteria,
  NovaSubmissionWithScoresAndCriteria,
} from '@tuturuuu/types/db';

// Helper interfaces for return types
interface SessionDetails {
  session: NovaSession;
  problems: NovaProblem[];
}

/**
 * Fetches user-accessible data (sessions and submissions) using the regular client
 * and fetches restricted data (problems and challenge details) using the admin client
 */
export async function fetchSessionDetails(
  sessionId: string,
  challengeId: string
): Promise<SessionDetails> {
  const supabase = await createClient();
  const sbAdmin = await createAdminClient();

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      console.error('User fetch error:', userError);
      throw new Error('User not found');
    }

    if (!user) {
      throw new Error('User not found');
    }

    // Step 1: Get session data using regular client (user has permissions for their own sessions)
    const { data: session, error: sessionError } = await supabase
      .from('nova_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      console.error('Session fetch error:', sessionError);
      throw new Error('Session not found');
    }

    // Step 2: Get problems using admin client (users can't directly query problems)
    const { data: problems, error: problemsError } = await sbAdmin
      .from('nova_problems')
      .select('*')
      .eq('challenge_id', challengeId);

    if (problemsError || !problems) {
      console.error('Problems fetch error:', problemsError);
      throw new Error('Problems not found');
    }

    // Step 3: Get all submissions for this session (user has permissions)
    const { data: submissions, error: submissionsError } = await sbAdmin
      .from('nova_submissions_with_scores')
      .select('*')
      .eq('session_id', sessionId)
      .eq('user_id', user.id);

    if (submissionsError) {
      console.error('Submissions fetch error:', submissionsError);
      throw new Error('Failed to fetch submissions');
    }

    console.log(
      'Raw submissions data for session:',
      submissions ? `Found ${submissions.length} submissions` : 'No submissions'
    );

    // Step 4: Get criteria data for the challenge
    const { data: criteria, error: criteriaError } = await sbAdmin
      .from('nova_challenge_criteria')
      .select('*')
      .eq('challenge_id', challengeId);

    if (criteriaError) {
      console.error('Criteria fetch error:', criteriaError);
      throw new Error('Failed to fetch criteria');
    }

    // Step 5: Get criteria results for these submissions
    const submissionIds =
      submissions?.filter((s) => s.id !== null).map((s) => s.id as string) ||
      [];
    const { data: criteriaResults, error: resultsError } = submissionIds.length
      ? await sbAdmin
          .from('nova_submission_criteria')
          .select('*')
          .in('submission_id', submissionIds)
      : { data: [] as NovaSubmissionCriteria[], error: null };

    if (resultsError) {
      console.error('Criteria results fetch error:', resultsError);
      throw new Error('Failed to fetch criteria results');
    }

    // Step 6: Map the data into the expected structure
    // one-time map: submission_id → criteriaResults[]
    const resultsBySubmission = new Map<string, typeof criteriaResults>();
    criteriaResults?.forEach((r) => {
      if (!resultsBySubmission.has(r.submission_id))
        resultsBySubmission.set(r.submission_id, []);
      resultsBySubmission.get(r.submission_id)!.push(r);
    });

    const problemsWithSubmissions = problems.map((problem) => {
      // Find submissions for this problem
      const problemSubmissions =
        submissions
          ?.filter((sub) => sub.problem_id === problem.id)
          .map((submission) => {
            // Find criteria results for this submission
            const submissionCriteria =
              criteria?.map((criterion) => {
                if (!submission.id) {
                  console.warn('Found submission without id:', submission);
                  return {
                    ...criterion,
                    result: null,
                  };
                }

                const result = resultsBySubmission
                  .get(submission.id)
                  ?.find((r) => r.criteria_id === criterion.id);
                return {
                  ...criterion,
                  result,
                };
              }) || [];

            return {
              ...submission,
              criteria: submissionCriteria,
              total_tests: submission.total_tests || 0,
              passed_tests: submission.passed_tests || 0,
              test_case_score: submission.test_case_score || 0,
              total_criteria: submission.total_criteria || 0,
              sum_criterion_score: submission.sum_criterion_score || 0,
              criteria_score: submission.criteria_score || 0,
              total_score: submission.total_score || 0,
            };
          }) || [];
      return {
        ...problem,
        submissions: problemSubmissions,
      };
    });

    const result = {
      session,
      problems: problemsWithSubmissions,
    };

    console.log('Session details:', {
      sessionId: session.id,
      problemCount: problemsWithSubmissions.length,
      submissionsPerProblem: problemsWithSubmissions.map(
        (p) => p.submissions.length
      ),
    });

    return result;
  } catch (error) {
    console.error('Error in fetchSessionDetails:', error);
    throw error;
  }
}

/**
 * Fetches all problems for a challenge with the user's submissions
 * across all sessions
 */
export async function fetchAllProblems(
  challengeId: string,
  userId: string
): Promise<{
  problems: NovaProblem[];
}> {
  const supabase = await createClient();
  const sbAdmin = await createAdminClient();

  try {
    // Step 1: Get all problems for this challenge using admin client
    const { data: problems, error: problemsError } = await sbAdmin
      .from('nova_problems')
      .select('*')
      .eq('challenge_id', challengeId);

    if (problemsError || !problems) {
      console.error('Problems fetch error:', problemsError);
      throw new Error('Failed to fetch problems');
    }

    // Step 2: Get the user's sessions for this challenge using regular client
    const { data: sessions, error: sessionsError } = await supabase
      .from('nova_sessions')
      .select('id')
      .eq('challenge_id', challengeId)
      .eq('user_id', userId);

    if (sessionsError) {
      console.error('Sessions fetch error:', sessionsError);
      throw new Error('Failed to fetch sessions');
    }

    // If no sessions, return problems with empty submissions
    if (!sessions || sessions.length === 0) {
      return {
        problems: problems.map((p) => ({ ...p, submissions: [] })),
      };
    }

    // Step 3: Get all submissions for these sessions
    const sessionIds = sessions.map((s) => s.id);
    const { data: allSubmissions, error: submissionsError } = await sbAdmin
      .from('nova_submissions_with_scores')
      .select('*')
      .in('session_id', sessionIds);

    if (submissionsError) {
      console.error('Submissions fetch error:', submissionsError);
      throw new Error('Failed to fetch submissions');
    }

    console.log(
      'All submissions across sessions:',
      allSubmissions
        ? `Found ${allSubmissions.length} submissions across ${sessions.length} sessions`
        : 'No submissions'
    );

    // Step 4: Get criteria data for the challenge
    const { data: criteria, error: criteriaError } = await sbAdmin
      .from('nova_challenge_criteria')
      .select('*')
      .eq('challenge_id', challengeId);

    if (criteriaError) {
      console.error('Criteria fetch error:', criteriaError);
      throw new Error('Failed to fetch criteria');
    }

    // Step 5: Get criteria results for submissions if we have any
    const submissionIds =
      allSubmissions?.filter((s) => s.id !== null).map((s) => s.id as string) ||
      [];
    const { data: criteriaResults, error: resultsError } = submissionIds.length
      ? await sbAdmin
          .from('nova_submission_criteria')
          .select('*')
          .in('submission_id', submissionIds)
      : { data: [], error: null };

    if (resultsError) {
      console.error('Criteria results fetch error:', resultsError);
      throw new Error('Failed to fetch criteria results');
    }

    // Step 6: Group submissions by problem_id
    const submissionsByProblem: Record<
      string,
      NovaSubmissionWithScoresAndCriteria[]
    > = {};

    if (allSubmissions && allSubmissions.length > 0) {
      allSubmissions.forEach((submission) => {
        // Skip submissions without a problem_id
        const problemId = submission.problem_id;
        if (!problemId) {
          console.warn('Found submission without problem_id:', submission.id);
          return;
        }

        // Initialize the array if needed
        if (!submissionsByProblem[problemId]) {
          submissionsByProblem[problemId] = [];
        }

        // Format criteria for this submission
        const submissionCriteria =
          criteria?.map((criterion) => {
            const result = criteriaResults?.find(
              (result) =>
                result.criteria_id === criterion.id &&
                result.submission_id === submission.id
            );

            return {
              ...criterion,
              result,
            };
          }) || [];

        submissionsByProblem[problemId].push({
          ...submission,
          criteria: submissionCriteria,
        });
      });
    }

    // Map problems with their submissions
    const problemsWithSubmissions = problems.map((problem) => ({
      ...problem,
      submissions: submissionsByProblem[problem.id] || [],
    }));

    console.log('All problems data:', {
      problemCount: problemsWithSubmissions.length,
      submissionsPerProblem: problemsWithSubmissions.map(
        (p) => p.submissions.length
      ),
    });

    return { problems: problemsWithSubmissions };
  } catch (error) {
    console.error('Error in fetchAllProblems:', error);
    throw error;
  }
}
