'use server';

import { createAdminClient } from '@tuturuuu/supabase/next/server';

export const getFullSubmission = async (
  submissionId: string,
  includeHiddenTestCases: boolean = false
) => {
  if (!submissionId) return;

  const sbAdmin = await createAdminClient();

  let query = sbAdmin
    .from('nova_submission_test_cases')
    .select(
      '*, ...nova_problem_test_cases!inner(input, expected_output:output, hidden)'
    )
    .eq('submission_id', submissionId);

  if (!includeHiddenTestCases) {
    query = query.eq('nova_problem_test_cases.hidden', false);
  }

  const { data: submissionTestCases, error: errorSubmissionTestCases } =
    await query;

  if (errorSubmissionTestCases || !submissionTestCases) {
    console.error(
      'Error fetching submission test cases:',
      errorSubmissionTestCases
    );
    return;
  }

  const { data: submissionCriteria, error: errorCriteria } = await sbAdmin
    .from('nova_submission_criteria')
    .select('*, ...nova_challenge_criteria!inner(name, description)')
    .eq('submission_id', submissionId);

  if (errorCriteria || !submissionCriteria) {
    console.error('Error fetching submission criteria:', errorCriteria);
    return;
  }

  return {
    test_cases: submissionTestCases,
    criteria: submissionCriteria,
  };
};
