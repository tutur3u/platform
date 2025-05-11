'use server';

import { createAdminClient } from '@tuturuuu/supabase/next/server';

export const fetchFullSubmission = async (submissionId: string) => {
  if (!submissionId) return;

  const sbAdmin = await createAdminClient();

  const { data: submissionCriteria, error: errorCriteria } = await sbAdmin
    .from('nova_submission_criteria')
    .select('*, ...nova_challenge_criteria!inner(name, description)')
    .eq('submission_id', submissionId);

  const { data: submissionTestCases, error: errorSubmissionTestCases } =
    await sbAdmin
      .from('nova_submission_test_cases')
      .select(
        '*, ...nova_problem_test_cases!inner(input, expected_output:output, hidden)'
      )
      .eq('hidden', false)
      .eq('submission_id', submissionId);

  if (errorCriteria || !submissionCriteria) {
    console.error('Error fetching submission criteria:', errorCriteria);
    return;
  }

  if (errorSubmissionTestCases || !submissionTestCases) {
    console.error(
      'Error fetching submission test cases:',
      errorSubmissionTestCases
    );
    return;
  }

  return {
    criteria: submissionCriteria,
    test_cases: submissionTestCases,
  };
};
