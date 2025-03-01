import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    challengeId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { challengeId } = await params;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  // Get the status of the challenge
  const { data: status, error } = await supabase
    .from('nova_challenge_status')
    .select('*')
    .eq('challenge_id', challengeId)
    .eq('user_id', user.id)
    .single();

  if (error) {
    return NextResponse.json(
      { message: 'Error fetching challenge status' },
      { status: 500 }
    );
  }

  return NextResponse.json(status);
}

export async function POST(request: Request, { params }: Params) {
  const { startTime, endTime, status } = await request.json();
  const { challengeId } = await params;

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  if (status !== 'IN_PROGRESS') {
    return NextResponse.json(
      { message: 'Invalid status. Only IN_PROGRESS is allowed.' },
      { status: 400 }
    );
  }

  // Check if user has already started this challenge
  const { data: existingChallengeStatus } = await supabase
    .from('nova_challenge_status')
    .select('*')
    .eq('status', 'IN_PROGRESS')
    .eq('challenge_id', challengeId)
    .eq('user_id', user.id)
    .single();

  if (existingChallengeStatus) {
    return NextResponse.json(
      { message: 'Challenge already started' },
      { status: 400 }
    );
  }

  // Create initial submission record
  const { data: newChallengeStatus, error } = await supabase
    .from('nova_challenge_status')
    .insert({
      start_time: startTime,
      end_time: endTime,
      status: status,
      challenge_id: challengeId,
      user_id: user.id,
    });

  if (error) {
    console.error('Error starting challenge:', error);
    return NextResponse.json(
      { message: 'Error starting challenge' },
      { status: 500 }
    );
  }

  return NextResponse.json(newChallengeStatus);
}

export async function PUT(request: Request, { params }: Params) {
  const supabase = await createClient();
  const { status, totalScore } = await request.json();
  const { challengeId } = await params;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  if (!status || status !== 'ENDED') {
    return NextResponse.json(
      { message: 'Invalid status. Only ENDED is allowed.' },
      { status: 400 }
    );
  }

  const { data: existingChallengeStatus } = await supabase
    .from('nova_challenge_status')
    .select('*')
    .eq('status', 'IN_PROGRESS')
    .eq('challenge_id', challengeId)
    .eq('user_id', user.id)
    .single();

  if (!existingChallengeStatus) {
    return NextResponse.json(
      { message: 'Can not end challenge that is not in progress' },
      { status: 404 }
    );
  }

  // Update all submissions for this challenge to mark them as ended
  const { data: updatedChallengeStatus, error } = await supabase
    .from('nova_challenge_status')
    .update({
      status: status,
      total_score: totalScore,
    })
    .eq('challenge_id', challengeId)
    .eq('user_id', user.id);

  if (error) {
    console.error('Error ending challenge:', error);
    return NextResponse.json(
      { message: 'Error ending challenge' },
      { status: 500 }
    );
  }

  return NextResponse.json(updatedChallengeStatus);
}
