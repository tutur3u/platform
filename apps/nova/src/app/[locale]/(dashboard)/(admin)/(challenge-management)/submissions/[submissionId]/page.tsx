import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { NovaSubmissionData } from '@tuturuuu/types';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireNovaAppSessionUser } from '@/lib/app-session';
import SubmissionClient from './client';

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

  const sbAdmin = await createAdminClient({ noCookie: true });
  const user = await requireNovaAppSessionUser();

  if (!user) notFound();

  try {
    const { data: submission, error } = await sbAdmin
      .schema('private')
      .from('nova_submissions_with_scores')
      .select('*')
      .eq('id', submissionId)
      .single();

    if (error || !submission || !submission.problem_id || !submission.user_id) {
      console.error('Error fetching submission:', error);
      return notFound();
    }

    const { data: submissionUser, error: submissionUserError } = await sbAdmin
      .from('users')
      .select('id, display_name, avatar_url')
      .eq('id', submission.user_id)
      .single();

    if (submissionUserError || !submissionUser) {
      console.error('Error fetching submission user:', submissionUserError);
      return notFound();
    }

    const { data: session, error: sessionError } = submission.session_id
      ? await sbAdmin
          .schema('private')
          .from('nova_sessions')
          .select('*')
          .eq('id', submission.session_id)
          .maybeSingle()
      : { data: null, error: null };

    if (sessionError) {
      console.error('Error fetching submission session:', sessionError);
    }

    const { data: submissionCriteriaScores, error: errorCriteria } =
      await sbAdmin
        .schema('private')
        .from('nova_submission_criteria')
        .select('*')
        .eq('submission_id', submissionId);

    if (errorCriteria || !submissionCriteriaScores) {
      console.error('Error fetching submission criteria:', errorCriteria);
      return notFound();
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
        return notFound();
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

    const { data: testCases, error: errorTestCases } = await sbAdmin
      .schema('private')
      .from('nova_submission_test_cases')
      .select(
        '*, ...nova_problem_test_cases!inner(input, expected_output:output)'
      )
      .eq('submission_id', submissionId);

    if (errorTestCases || !testCases) {
      console.error('Error fetching submission test cases:', errorTestCases);
      return notFound();
    }

    const { data: problem, error: errorProblem } = await sbAdmin
      .schema('private')
      .from('nova_problems')
      .select('*')
      .eq('id', submission.problem_id)
      .single();

    if (errorProblem || !problem) {
      console.error('Error fetching problem:', errorProblem);
      return notFound();
    }

    const { data: challenge, error: errorChallenge } = await sbAdmin
      .schema('private')
      .from('nova_challenges')
      .select('*')
      .eq('id', problem.challenge_id)
      .single();

    if (errorChallenge || !challenge) {
      console.error('Error fetching challenge:', errorChallenge);
      return notFound();
    }

    // Combine the data into our extended submission format with null safety
    const submissionData: NovaSubmissionData = {
      ...submission,
      criteria: submissionCriteria,
      test_cases: testCases,
      session,
      problem,
      challenge,
      user: submissionUser,
    };

    return <SubmissionClient submission={submissionData} />;
  } catch (error) {
    console.error('Error fetching data:', error);
    notFound();
  }
}
