import SessionClient from './client';
import { SessionData, type SessionSubmission } from './types';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/server/user-helper';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';

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
  const sbAdmin = await createAdminClient();
  const user = await getCurrentSupabaseUser();

  if (!user) {
    return notFound();
  }

  // Fetch the session with related data
  const { data: session, error } = await sbAdmin
    .from('nova_sessions')
    .select(
      `
      *,
      challenge:nova_challenges (
        id,
        title,
        description
      ),
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
      problem:nova_problems (
        id,
        title
      ),
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

  // Map submissions to the expected format
  const mappedSubmissions =
    submissions?.map((sub) => ({
      id: sub.id,
      problemId: sub.problem_id,
      problemTitle: sub.problem?.title || 'Unknown Problem',
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
      id: session.challenge.id,
      title: session.challenge.title,
      description: session.challenge.description || '',
    },
    submissions: mappedSubmissions as SessionSubmission[],
  };

  return <SessionClient session={sessionData} />;
}
