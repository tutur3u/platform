import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getNovaAppSessionUserFromRequest } from '@/lib/app-session';
import { hasChallengeAccess, requestCookieStore } from '@/lib/challenge-access';
import {
  hasActiveNovaChallengeSession,
  isManagerCatalogAccess,
  resolveNovaCatalogActor,
  resolveNovaChallengeCatalogAccess,
} from '@/lib/challenge-catalog-access';
import { createSessionSchema } from '../schemas';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const challengeId = searchParams.get('challengeId');

  const supabase = await createAdminClient({ noCookie: true });
  const user = getNovaAppSessionUserFromRequest(request);

  if (!user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    let query = supabase
      .schema('private')
      .from('nova_sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (challengeId) {
      query = query.eq('challenge_id', challengeId);
    }

    const { data: sessions, error } = await query;

    if (error) {
      console.error('Database Error: ', error);
      return NextResponse.json(
        { message: 'Error fetching sessions' },
        { status: 500 }
      );
    }

    return NextResponse.json(sessions || [], { status: 200 });
  } catch (error) {
    console.error('Unexpected Error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const supabase = await createAdminClient({ noCookie: true });
  const user = getNovaAppSessionUserFromRequest(request);

  if (!user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }

  try {
    // Validate request body with Zod
    const validatedData = createSessionSchema.parse(body);

    const { data: challenge, error: challengeError } = await supabase
      .schema('private')
      .from('nova_challenges')
      .select(
        'id, enabled, previewable_at, open_at, close_at, duration, max_attempts, max_daily_attempts, whitelisted_only, password_hash'
      )
      .eq('id', validatedData.challengeId)
      .maybeSingle();

    if (challengeError) throw challengeError;
    if (!challenge) {
      return NextResponse.json(
        { message: 'Challenge not found' },
        { status: 404 }
      );
    }

    const access = await resolveNovaChallengeCatalogAccess({
      actor: await resolveNovaCatalogActor({ sbAdmin: supabase, user }),
      challenge,
      sbAdmin: supabase,
    });
    if (access === 'denied') {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    // Participants must hold the signed grant issued after the challenge
    // password verifies; starting a session unlocks the challenge problems.
    if (
      !isManagerCatalogAccess(access) &&
      !hasChallengeAccess(challenge, requestCookieStore(request), user.id)
    ) {
      return NextResponse.json(
        { message: 'Challenge password required' },
        { status: 403 }
      );
    }

    const now = new Date();
    if (!isManagerCatalogAccess(access)) {
      const opensAt = challenge.open_at
        ? new Date(challenge.open_at).getTime()
        : Number.NEGATIVE_INFINITY;
      const closesAt = challenge.close_at
        ? new Date(challenge.close_at).getTime()
        : Number.POSITIVE_INFINITY;

      if (now.getTime() < opensAt || now.getTime() >= closesAt) {
        return NextResponse.json(
          { message: 'Challenge is outside its session window' },
          { status: 403 }
        );
      }
    }

    const today = new Date(now);
    today.setUTCHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    const [totalAttempts, dailyAttempts] = await Promise.all([
      supabase
        .schema('private')
        .from('nova_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('challenge_id', challenge.id)
        .eq('user_id', user.id),
      supabase
        .schema('private')
        .from('nova_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('challenge_id', challenge.id)
        .eq('user_id', user.id)
        .gte('created_at', today.toISOString())
        .lt('created_at', tomorrow.toISOString()),
    ]);

    if (totalAttempts.error || dailyAttempts.error) {
      console.error(
        'Database Error while counting session attempts:',
        totalAttempts.error ?? dailyAttempts.error
      );
      return NextResponse.json(
        { message: 'Error checking session attempts' },
        { status: 500 }
      );
    }

    if (
      (totalAttempts.count ?? 0) >= challenge.max_attempts ||
      (dailyAttempts.count ?? 0) >= challenge.max_daily_attempts
    ) {
      return NextResponse.json(
        { message: 'Challenge attempt limit reached' },
        { status: 403 }
      );
    }

    if (
      await hasActiveNovaChallengeSession({
        challengeId: challenge.id,
        now,
        sbAdmin: supabase,
        userId: user.id,
      })
    ) {
      return NextResponse.json(
        { message: 'An active challenge session already exists' },
        { status: 409 }
      );
    }

    const sessionData = {
      start_time: now.toISOString(),
      end_time: null,
      status: 'IN_PROGRESS',
      challenge_id: validatedData.challengeId,
      user_id: user.id,
    };

    const { data: session, error: sessionError } = await supabase
      .schema('private')
      .from('nova_sessions')
      .insert(sessionData)
      .select()
      .single();

    if (sessionError) {
      console.error('Database Error: ', sessionError);
      if (
        sessionError.code === 'P0001' &&
        /attempt/i.test(sessionError.message)
      ) {
        return NextResponse.json(
          { message: 'Challenge attempt limit reached' },
          { status: 403 }
        );
      }
      return NextResponse.json(
        { message: 'Error creating session' },
        { status: 500 }
      );
    }

    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      // Zod validation error
      return NextResponse.json(
        { message: 'Validation error', errors: error.issues },
        { status: 400 }
      );
    }

    console.error('Unexpected Error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
