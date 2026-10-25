'use server';

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { requireNovaAppSessionUser } from '@/lib/app-session';
import {
  canManageNovaChallenge,
  getNovaProblemChallengeId,
} from '@/lib/challenge-management-auth';
import { canViewNovaSubmission } from '@/lib/submission-access';

export const getFullSubmission = async (
  submissionId: string,
  includeHiddenTestCases: boolean = false
) => {
  if (!submissionId) return;

  const user = await requireNovaAppSessionUser();
  const sbAdmin = await createAdminClient({ noCookie: true });
  const { data: submission, error: submissionError } = await sbAdmin
    .schema('private')
    .from('nova_submissions')
    .select('problem_id, session_id, user_id')
    .eq('id', submissionId)
    .maybeSingle();
  if (submissionError || !submission?.problem_id || !submission.user_id) {
    throw new Error('Submission not found');
  }
  const { challengeId, error: challengeError } =
    await getNovaProblemChallengeId(submission.problem_id, sbAdmin);
  if (challengeError || !challengeId) throw new Error('Submission not found');
  const allowed = includeHiddenTestCases
    ? await canManageNovaChallenge(user, challengeId, sbAdmin)
    : await canViewNovaSubmission(
        user,
        { sessionId: submission.session_id, userId: submission.user_id },
        challengeId,
        sbAdmin
      );
  if (!allowed) throw new Error('Forbidden');

  let query = sbAdmin
    .schema('private')
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

  const { data: submissionCriteriaScores, error: errorCriteria } = await sbAdmin
    .schema('private')
    .from('nova_submission_criteria')
    .select('*')
    .eq('submission_id', submissionId);

  if (errorCriteria || !submissionCriteriaScores) {
    console.error('Error fetching submission criteria:', errorCriteria);
    return;
  }

  const criterionIds = submissionCriteriaScores.map(
    (criterion) => criterion.criteria_id
  );
  const criterionDefinitionById = new Map<
    string,
    { description: string | null; name: string }
  >();

  if (criterionIds.length > 0) {
    const { data: criterionDefinitions, error: criterionDefinitionsError } =
      await sbAdmin
        .schema('private')
        .from('nova_challenge_criteria')
        .select('id, name, description')
        .in('id', criterionIds);

    if (criterionDefinitionsError || !criterionDefinitions) {
      console.error(
        'Error fetching criterion definitions:',
        criterionDefinitionsError
      );
      return;
    }

    for (const criterion of criterionDefinitions) {
      criterionDefinitionById.set(criterion.id, criterion);
    }
  }
  const submissionCriteria = submissionCriteriaScores.map((criterion) => {
    const definition = criterionDefinitionById.get(criterion.criteria_id);

    return {
      ...criterion,
      name: definition?.name || '',
      description: definition?.description || '',
    };
  });

  return {
    test_cases: submissionTestCases,
    criteria: submissionCriteria,
  };
};
