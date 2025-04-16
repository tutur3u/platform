import ResultClient from './client';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  NovaChallenge,
  NovaProblem,
  NovaSession,
  NovaSubmission,
} from '@tuturuuu/types/db';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import { redirect } from 'next/navigation';

type Results = {
  challenge: NovaChallenge;
  sessions: (NovaSession & {
    problems: (NovaProblem & {
      submissions: NovaSubmission[];
    })[];
  })[];
};

interface Props {
  params: Promise<{ challengeId: string }>;
}

export default async function Page({ params }: Props) {
  const { challengeId } = await params;
  const sbAdmin = await createAdminClient();
  const user = await getCurrentSupabaseUser();

  if (!user) redirect('/dashboard');

  try {
    // Get challenge
    const { data: challenge } = await sbAdmin
      .from('nova_challenges')
      .select('*')
      .eq('id', challengeId)
      .single();

    if (!challenge) {
      throw new Error('Challenge not found');
    }

    // Get sessions
    const { data: sessions } = await sbAdmin
      .from('nova_sessions')
      .select('*')
      .eq('challenge_id', challengeId)
      .eq('user_id', user.id);

    if (!sessions) {
      throw new Error('Sessions not found');
    }

    const { data: problems } = await sbAdmin
      .from('nova_problems')
      .select('*, submissions:nova_submissions(*)')
      .eq('challenge_id', challengeId);

    const data: Results = {
      challenge,
      sessions: sessions.map((session) => ({
        ...session,
        problems:
          problems?.map((problem) => ({
            ...problem,
            submissions: problem.submissions.filter(
              (submission) => submission.session_id === session.id
            ),
          })) || [],
      })),
    };

    return <ResultClient data={data} />;
  } catch (error) {
    console.error('Error fetching data:', error);
    redirect('/challenges');
  }
}
