import SubmissionClient from './client';
import { SubmissionData } from './types';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';

interface Props {
  params: Promise<{
    submissionId: string;
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { submissionId } = await params;

  return {
    title: `Submission Details | ${submissionId}`,
    description:
      'Detailed view of a submission with scores, tests, and criteria evaluation',
  };
}

export default async function Page({ params }: Props) {
  const { submissionId } = await params;

  const sbAdmin = await createAdminClient();
  const user = await getCurrentSupabaseUser();

  if (!user) notFound();

  try {
    // Fetch submission data with all relationships
    const { data: submission, error } = await sbAdmin
      .from('nova_submissions_with_scores')
      .select(
        `
        *,
        problem:nova_problems(
          *,
          challenge:nova_challenges(*)
        ),
        user:users(
          id,
          display_name,
          avatar_url
        ),
        criteria:nova_challenge_criteria(
          *,
          results:nova_submission_criteria(*)
        ),
        test_cases:nova_submission_test_cases(
          *,
          test_case:nova_problem_test_cases(*)
        )
      `
      )
      .eq('id', submissionId)
      .single();

    if (error) {
      console.error('Error fetching submission:', error);
      return notFound();
    }

    // Fetch user's email from user_private_details
    let userEmail = null;
    if (submission?.user?.id) {
      const { data: userPrivate } = await sbAdmin
        .from('user_private_details')
        .select('email')
        .eq('user_id', submission.user.id)
        .single();

      if (userPrivate?.email) {
        userEmail = userPrivate.email;
      }
    }

    // Prepare properly formatted criteria
    const formattedCriteria = submission.criteria.map((criterion: any) => ({
      ...criterion,
      results: undefined,
      result: criterion.results.find(
        (result: any) => result.submission_id === submission.id
      ),
    }));

    // Prepare formatted test cases
    const formattedTestCases = submission.test_cases.map((testCase: any) => ({
      ...testCase,
      test_case: testCase.test_case,
    }));

    // Define default problem structure to match expected type
    const formattedProblem = {
      challenge_id: submission.problem?.challenge_id ?? '',
      created_at: submission.problem?.created_at ?? '',
      description: submission.problem?.description ?? '',
      example_input: submission.problem?.example_input ?? '',
      example_output: submission.problem?.example_output ?? '',
      id: submission.problem?.id ?? '',
      max_prompt_length: submission.problem?.max_prompt_length ?? 0,
      title: submission.problem?.title ?? '',
      challenge: {
        id: submission.problem?.challenge?.id ?? '',
        created_at: submission.problem?.challenge?.created_at ?? '',
        title: submission.problem?.challenge?.title ?? '',
        description: submission.problem?.challenge?.description ?? '',
        duration: submission.problem?.challenge?.duration ?? 0,
        enabled: submission.problem?.challenge?.enabled ?? false,
        close_at: submission.problem?.challenge?.close_at ?? null,
        open_at: submission.problem?.challenge?.open_at ?? null,
        previewable_at: submission.problem?.challenge?.previewable_at ?? null,
        whitelisted_only:
          submission.problem?.challenge?.whitelisted_only ?? false,
        max_attempts: submission.problem?.challenge?.max_attempts ?? 0,
        max_daily_attempts:
          submission.problem?.challenge?.max_daily_attempts ?? 0,
        password_hash: submission.problem?.challenge?.password_hash ?? '',
        password_salt: submission.problem?.challenge?.password_salt ?? '',
      },
    };

    // Define default user structure to match expected type
    const formattedUser = {
      id: submission.user?.id || '',
      display_name: submission.user?.display_name || '',
      avatar_url: submission.user?.avatar_url || '',
      email: userEmail,
    };

    // Fetch session data if available
    let sessionData = null;
    if (submission.session_id) {
      const { data: session } = await sbAdmin
        .from('nova_sessions')
        .select('*')
        .eq('id', submission.session_id)
        .single();

      sessionData = session;
    }

    // Combine the data into our extended submission format
    const submissionData: SubmissionData = {
      id: submission.id || '',
      overall_assessment: '',
      created_at: submission.created_at || '',
      problem_id: submission.problem_id || '',
      prompt: submission.prompt || '',
      session_id: submission.session_id || null,
      user_id: submission.user_id || '',
      total_tests: submission.total_tests || 0,
      passed_tests: submission.passed_tests || 0,
      test_case_score: submission.test_case_score || 0,
      criteria: formattedCriteria,
      total_criteria: submission.total_criteria || 0,
      sum_criterion_score: submission.sum_criterion_score || 0,
      criteria_score: submission.criteria_score || 0,
      total_score: submission.total_score || 0,
      problem: formattedProblem,
      user: formattedUser,
      test_cases: formattedTestCases,
      session: sessionData,
    };

    return <SubmissionClient submission={submissionData} />;
  } catch (error) {
    console.error('Error fetching data:', error);
    notFound();
  }
}
