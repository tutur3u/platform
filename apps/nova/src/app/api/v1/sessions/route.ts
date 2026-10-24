import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getNovaAppSessionUserFromRequest } from '@/lib/app-session';
import { hasChallengeAccess, requestCookieStore } from '@/lib/challenge-access';
import {
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
  } catch (_error) {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }

  try {
    // Validate request body with Zod
    const validatedData = createSessionSchema.parse(body);

    const { data: challenge, error: challengeError } = await supabase
      .schema('private')
      .from('nova_challenges')
      .select('id, enabled, previewable_at, whitelisted_only, password_hash')
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

    const sessionData = {
      start_time: validatedData.startTime,
      end_time: validatedData.endTime,
      status: validatedData.status,
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
