import SubmissionClient from './client';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { NovaSubmissionData } from '@tuturuuu/types/db';
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
    const { data: submission, error } = await sbAdmin
      .from('nova_submissions_with_scores')
      .select(
        `
        *,
        user:users!inner(
          id,
          display_name,
          avatar_url
        ),
        session:nova_sessions!inner(
          *
        )
      `
      )
      .eq('id', submissionId)
      .single();

    if (
      error ||
      !submission ||
      !submission.problem_id ||
      !submission.session?.challenge_id
    ) {
      console.error('Error fetching submission:', error);
      return notFound();
    }

    const { data: submissionCriteria, error: errorCriteria } = await sbAdmin
      .from('nova_submission_criteria')
      .select('*, ...nova_challenge_criteria!inner(name, description)')
      .eq('submission_id', submissionId);

    const { data: testCases, error: errorTestCases } = await sbAdmin
      .from('nova_submission_test_cases')
      .select(
        '*, ...nova_problem_test_cases!inner(input, expected_output:output)'
      )
      .eq('submission_id', submissionId);

    const { data: problem, error: errorProblem } = await sbAdmin
      .from('nova_problems')
      .select('*')
      .eq('id', submission.problem_id)
      .single();

    const { data: challenge, error: errorChallenge } = await sbAdmin
      .from('nova_challenges')
      .select('*')
      .eq('id', submission.session?.challenge_id)
      .single();

    if (errorCriteria || !submissionCriteria) {
      console.error('Error fetching submission criteria:', errorCriteria);
      return notFound();
    }

    if (errorTestCases || !testCases) {
      console.error('Error fetching submission test cases:', errorTestCases);
      return notFound();
    }

    if (errorProblem || !problem) {
      console.error('Error fetching problem:', errorProblem);
      return notFound();
    }

    if (errorChallenge || !challenge) {
      console.error('Error fetching challenge:', errorChallenge);
      return notFound();
    }

    // Combine the data into our extended submission format with null safety
    const submissionData: NovaSubmissionData = {
      ...submission,
      criteria: submissionCriteria,
      test_cases: testCases,
      problem,
      challenge,
    };

    console.log(submissionData);

    return <SubmissionClient submission={submissionData} />;
  } catch (error) {
    console.error('Error fetching data:', error);
    notFound();
  }
}
