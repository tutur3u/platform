import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { generateSalt, hashPassword } from '@tuturuuu/utils/crypto';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getNovaAppSessionUserFromRequest } from '@/lib/app-session';
import {
  resolveNovaCatalogActor,
  resolveNovaChallengeCatalogAccess,
  toParticipantChallenge,
} from '@/lib/challenge-catalog-access';
import { canManageNovaChallengesGlobally } from '@/lib/challenge-management-auth';
import { createChallengeSchema } from '../schemas';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const enabled = searchParams.get('enabled');

  const user = getNovaAppSessionUserFromRequest(request);

  if (!user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const sbAdmin = await createAdminClient({ noCookie: true });

  try {
    const actor = await resolveNovaCatalogActor({ sbAdmin, user });
    if (actor.kind === 'denied') {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    if (actor.kind === 'assigned-manager' && actor.challengeIds.size === 0) {
      return NextResponse.json([], { status: 200 });
    }

    let query = sbAdmin
      .schema('private')
      .from('nova_challenges')
      .select('*')
      .order('created_at', { ascending: false });

    if (actor.kind === 'assigned-manager') {
      query = query.in('id', [...actor.challengeIds]);
    }

    if (enabled) {
      query = query.eq('enabled', enabled === 'true');
    }

    const { data: challenges, error } = await query;

    if (error) {
      console.error('Database Error: ', error);
      return NextResponse.json(
        { message: 'Error fetching challenges' },
        { status: 500 }
      );
    }

    if (actor.kind !== 'participant') {
      return NextResponse.json(
        challenges.map((challenge) => ({
          ...challenge,
          password_salt: challenge.password_salt !== null ? '' : null,
          password_hash: challenge.password_hash !== null ? '' : null,
        })),
        { status: 200 }
      );
    }

    const challengeIds = challenges.map((challenge) => challenge.id);
    const whitelistedChallengeIds = new Set<string>();
    if (
      user.email &&
      challenges.some((challenge) => challenge.whitelisted_only)
    ) {
      const { data: whitelists, error: whitelistError } = await sbAdmin
        .schema('private')
        .from('nova_challenge_whitelisted_emails')
        .select('challenge_id')
        .eq('email', user.email)
        .in('challenge_id', challengeIds);

      if (whitelistError) throw whitelistError;
      for (const whitelist of whitelists ?? []) {
        whitelistedChallengeIds.add(whitelist.challenge_id);
      }
    }

    const visibleChallenges: ReturnType<typeof toParticipantChallenge>[] = [];
    for (const challenge of challenges) {
      const access = await resolveNovaChallengeCatalogAccess({
        actor,
        challenge,
        sbAdmin,
        whitelistedChallengeIds,
      });
      if (access === 'eligible-participant') {
        visibleChallenges.push(toParticipantChallenge(challenge));
      }
    }

    return NextResponse.json(visibleChallenges, { status: 200 });
  } catch (error) {
    console.error('Unexpected Error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const user = getNovaAppSessionUserFromRequest(request);

  if (!user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const sbAdmin = await createAdminClient({ noCookie: true });

  if (!(await canManageNovaChallengesGlobally(user, sbAdmin))) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch (_error) {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }

  try {
    // Validate request body with Zod
    const validatedData = createChallengeSchema.parse(body);

    let passwordSalt = null;
    let passwordHash = null;

    if (validatedData.password) {
      passwordSalt = generateSalt();
      passwordHash = await hashPassword(validatedData.password, passwordSalt);
    }

    const challengeData = {
      title: validatedData.title,
      description: validatedData.description,
      duration: validatedData.duration,
      enabled: validatedData.enabled,
      whitelisted_only: validatedData.whitelistedOnly,
      max_attempts: validatedData.maxAttempts,
      max_daily_attempts: validatedData.maxDailyAttempts,
      password_hash: passwordHash,
      password_salt: passwordSalt,
      previewable_at: validatedData.previewableAt,
      open_at: validatedData.openAt,
      close_at: validatedData.closeAt,
    };

    const { data: challenge, error: challengeError } = await sbAdmin
      .schema('private')
      .from('nova_challenges')
      .insert(challengeData)
      .select()
      .single();

    if (challengeError) {
      console.error('Database Error when creating challenge:', challengeError);
      return NextResponse.json(
        { message: 'Error creating challenge' },
        { status: 500 }
      );
    }

    return NextResponse.json(challenge, { status: 201 });
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
