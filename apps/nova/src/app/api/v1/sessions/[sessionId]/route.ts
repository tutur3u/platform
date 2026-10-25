import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { getNovaAppSessionUserFromRequest } from '@/lib/app-session';
import { hasActiveNovaChallengeSession } from '@/lib/challenge-catalog-access';

interface Params {
  params: Promise<{
    sessionId: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  const supabase = await createAdminClient({ noCookie: true });
  const { sessionId } = await params;
  const user = getNovaAppSessionUserFromRequest(request);

  if (!user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data: session, error } = await supabase
      .schema('private')
      .from('nova_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single();

    if (error) {
      console.error('Database Error: ', error);
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { message: 'Session not found' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { message: 'Error fetching session' },
        { status: 500 }
      );
    }

    if (
      session.status === 'IN_PROGRESS' &&
      !(await hasActiveNovaChallengeSession({
        challengeId: session.challenge_id,
        sbAdmin: supabase,
        userId: user.id,
      }))
    ) {
      return NextResponse.json(
        { message: 'Challenge session has expired' },
        { status: 410 }
      );
    }

    return NextResponse.json(session, { status: 200 });
  } catch (error) {
    console.error('Unexpected Error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request, { params }: Params) {
  const supabase = await createAdminClient({ noCookie: true });
  const { sessionId } = await params;
  const user = getNovaAppSessionUserFromRequest(request);

  if (!user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    startTime?: string;
    endTime?: string;
    status?: string;
    challengeId?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }

  try {
    // Check if any update data was provided
    if (Object.keys(body).length === 0) {
      return NextResponse.json(
        { message: 'No update data provided' },
        { status: 400 }
      );
    }

    // Participants may only end their own session. Moving a session to
    // another challenge, rewriting its start or reopening it would bypass the
    // challenge access checks applied when the session was created.
    if (
      body.challengeId !== undefined ||
      body.startTime !== undefined ||
      (body.status !== undefined && body.status !== 'ENDED')
    ) {
      return NextResponse.json(
        { message: 'Only ending a session is supported' },
        { status: 400 }
      );
    }

    const { data: session, error: sessionError } = await supabase
      .schema('private')
      .from('nova_sessions')
      .select('challenge_id, start_time, status')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (sessionError) throw sessionError;
    if (!session) {
      return NextResponse.json(
        { message: 'Session not found' },
        { status: 404 }
      );
    }
    if (session.status !== 'IN_PROGRESS') {
      return NextResponse.json(
        { message: 'Session has already ended' },
        { status: 409 }
      );
    }

    const { data: challenge, error: challengeError } = await supabase
      .schema('private')
      .from('nova_challenges')
      .select('duration, close_at')
      .eq('id', session.challenge_id)
      .maybeSingle();

    if (challengeError) throw challengeError;
    if (!challenge || typeof challenge.duration !== 'number') {
      return NextResponse.json(
        { message: 'Challenge not found' },
        { status: 404 }
      );
    }

    const startTime = new Date(session.start_time).getTime();
    if (!Number.isFinite(startTime) || startTime > Date.now()) {
      return NextResponse.json(
        { message: 'Challenge session has not started' },
        { status: 403 }
      );
    }
    const durationEnd = startTime + challenge.duration * 1000;
    const closeEnd = challenge.close_at
      ? new Date(challenge.close_at).getTime()
      : Number.POSITIVE_INFINITY;
    const endTime = new Date(
      Math.min(Date.now(), durationEnd, closeEnd)
    ).toISOString();

    const { data: updatedSession, error: updateError } = await supabase
      .schema('private')
      .from('nova_sessions')
      .update({ end_time: endTime, status: 'ENDED' })
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .eq('status', 'IN_PROGRESS')
      .select()
      .single();

    if (updateError) {
      console.error('Database Error: ', updateError);
      if (updateError.code === 'PGRST116') {
        return NextResponse.json(
          { message: 'Session not found' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { message: 'Error updating session' },
        { status: 500 }
      );
    }

    return NextResponse.json(updatedSession, { status: 200 });
  } catch (error) {
    console.error('Unexpected Error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const user = getNovaAppSessionUserFromRequest(request);

  if (!user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json(
    { message: 'Challenge sessions cannot be deleted' },
    { status: 403 }
  );
}
