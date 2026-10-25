import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { NextResponse } from 'next/server';
import {
  canManageNovaChallenge,
  getNovaProblemChallengeId,
} from '@/lib/challenge-management-auth';

type NovaSubmissionManager = Pick<SupabaseUser, 'email' | 'id'>;

export type NovaManagedSubmission = {
  challengeId: string;
  id: string;
  problemId: string;
  userId: string;
};

/**
 * Resolves a submission and requires the caller to manage its challenge.
 * Grading rows and submission mutations feed scores and leaderboards, so
 * participants (including the submission owner) must never write them.
 */
export async function requireNovaSubmissionManager(
  user: NovaSubmissionManager,
  submissionId: string,
  sbAdmin: TypedSupabaseClient
): Promise<
  | { response: null; submission: NovaManagedSubmission }
  | { response: NextResponse; submission: null }
> {
  const { data, error } = await sbAdmin
    .schema('private')
    .from('nova_submissions')
    .select('id, problem_id, user_id')
    .eq('id', submissionId)
    .maybeSingle();

  if (error) {
    console.error('Database Error when fetching submission:', error);
    return {
      response: NextResponse.json(
        { message: 'Error fetching submission' },
        { status: 500 }
      ),
      submission: null,
    };
  }

  if (!data?.problem_id) {
    return {
      response: NextResponse.json(
        { message: 'Submission not found' },
        { status: 404 }
      ),
      submission: null,
    };
  }

  const { challengeId, error: problemError } = await getNovaProblemChallengeId(
    data.problem_id,
    sbAdmin
  );

  if (problemError || !challengeId) {
    if (problemError) {
      console.error('Database Error when fetching problem:', problemError);
    }
    return {
      response: NextResponse.json(
        { message: 'Error fetching submission problem' },
        { status: 500 }
      ),
      submission: null,
    };
  }

  if (!(await canManageNovaChallenge(user, challengeId, sbAdmin))) {
    return {
      response: NextResponse.json({ message: 'Forbidden' }, { status: 403 }),
      submission: null,
    };
  }

  return {
    response: null,
    submission: {
      challengeId,
      id: data.id,
      problemId: data.problem_id,
      userId: data.user_id,
    },
  };
}
