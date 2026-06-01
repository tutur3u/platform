import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireNovaAppSessionUser } from '@/lib/app-session';
import SessionClient from './client';
import type { SessionData, SessionSubmission } from './types';

interface Props {
  params: Promise<{
    sessionId: string;
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const futureParams = await params;
  return {
    title: `Session - ${futureParams.sessionId}`,
  };
}

export default async function SessionPage({ params: futureParams }: Props) {
  const params = await futureParams;
  const sbAdmin = await createAdminClient({ noCookie: true });
  const user = await requireNovaAppSessionUser();

  if (!user) {
    return notFound();
  }

  // Fetch the session with public related data
  const { data: session, error } = await sbAdmin
    .from('nova_sessions')
    .select(
      `
      *,
      user:users (
        id,
        display_name,
        avatar_url
      )
    `
    )
    .eq('id', params.sessionId)
    .single();

  if (error || !session) {
    console.error('Error fetching session:', error);
    return notFound();
  }

  const { data: challenge, error: challengeError } = await sbAdmin
    .schema('private')
    .from('nova_challenges')
    .select('id, title, description')
    .eq('id', session.challenge_id)
    .single();

  if (challengeError || !challenge) {
    console.error('Error fetching challenge:', challengeError);
    return notFound();
  }

  // Fetch user email
  const { data: userPrivateDetails } = await sbAdmin
    .from('user_private_details')
    .select('email')
    .eq('user_id', session.user.id)
    .single();

  // Fetch submissions related to this session
  const { data: submissions, error: submissionsError } = await sbAdmin
    .from('nova_submissions_with_scores')
    .select(
      `
      id,
      problem_id,
      total_score,
      created_at
    `
    )
    .eq('user_id', session.user.id)
    .eq('session_id', session.id)
    .gte('created_at', session.start_time)
    .lte('created_at', session.end_time || new Date().toISOString())
    .order('created_at', { ascending: false });

  if (submissionsError) {
    console.error('Error fetching submissions:', submissionsError);
  }

  const problemIds = [
    ...new Set(
      (submissions || []).flatMap((submission) =>
        submission.problem_id ? [submission.problem_id] : []
      )
    ),
  ];
  const problemTitleById = new Map<string, string>();

  if (problemIds.length > 0) {
    const { data: problems, error: problemsError } = await sbAdmin
      .schema('private')
      .from('nova_problems')
      .select('id, title')
      .in('id', problemIds);

    if (problemsError) {
      console.error('Error fetching submission problems:', problemsError);
    }

    for (const problem of problems || []) {
      problemTitleById.set(problem.id, problem.title);
    }
  }

  // Map submissions to the expected format
  const mappedSubmissions =
    submissions?.map((sub) => ({
      id: sub.id,
      problemId: sub.problem_id,
      problemTitle:
        problemTitleById.get(sub.problem_id || '') || 'Unknown Problem',
      score: sub.total_score || 0,
      createdAt: sub.created_at ? new Date(sub.created_at).toISOString() : null,
    })) || [];

  const sessionData: SessionData = {
    id: session.id,
    status: session.status,
    startTime: new Date(session.start_time).toISOString(),
    endTime: session.end_time ? new Date(session.end_time).toISOString() : null,
    createdAt: new Date(session.created_at).toISOString(),
    user: {
      id: session.user.id,
      displayName: session.user.display_name || 'Unknown User',
      avatarUrl: session.user.avatar_url || '',
      email: userPrivateDetails?.email || null,
    },
    challenge: {
      id: challenge.id,
      title: challenge.title,
      description: challenge.description || '',
    },
    submissions: mappedSubmissions as SessionSubmission[],
  };

  return <SessionClient session={sessionData} />;
}
