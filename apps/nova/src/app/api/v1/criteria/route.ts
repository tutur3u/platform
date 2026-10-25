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
import { canManageNovaChallenge } from '@/lib/challenge-management-auth';
import { createCriterionSchema } from '../schemas';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const challengeId = searchParams.get('challengeId');
  const user = getNovaAppSessionUserFromRequest(request);

  if (!user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  if (!challengeId) {
    return NextResponse.json(
      { message: 'Challenge ID is required' },
      { status: 400 }
    );
  }

  const sbAdmin = await createAdminClient({ noCookie: true });

  try {
    const { data: challenge, error: challengeError } = await sbAdmin
      .schema('private')
      .from('nova_challenges')
      .select('id, enabled, previewable_at, whitelisted_only, password_hash')
      .eq('id', challengeId)
      .maybeSingle();

    if (challengeError) {
      console.error('Database Error: ', challengeError);
      return NextResponse.json(
        { message: 'Error fetching challenge' },
        { status: 500 }
      );
    }

    if (!challenge) {
      return NextResponse.json(
        { message: 'Challenge not found' },
        { status: 404 }
      );
    }

    const actor = await resolveNovaCatalogActor({ sbAdmin, user });
    const access = await resolveNovaChallengeCatalogAccess({
      actor,
      challenge,
      sbAdmin,
    });

    if (
      access === 'denied' ||
      (!isManagerCatalogAccess(access) &&
        !hasChallengeAccess(challenge, requestCookieStore(request), user.id))
    ) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const { data: criteria, error } = await sbAdmin
      .schema('private')
      .from('nova_challenge_criteria')
      .select('*')
      .eq('challenge_id', challengeId);

    if (error) {
      console.error('Database Error: ', error);
      return NextResponse.json(
        { message: 'Error fetching criteria' },
        { status: 500 }
      );
    }

    return NextResponse.json(criteria, { status: 200 });
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

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }

  try {
    // Validate request body with Zod
    const validatedData = createCriterionSchema.parse(body);
    const sbAdmin = await createAdminClient({ noCookie: true });

    if (
      !(await canManageNovaChallenge(user, validatedData.challengeId, sbAdmin))
    ) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const criterionData = {
      challenge_id: validatedData.challengeId,
      name: validatedData.name,
      description: validatedData.description,
    };

    const { data: criterion, error: criterionError } = await sbAdmin
      .schema('private')
      .from('nova_challenge_criteria')
      .insert(criterionData)
      .select()
      .single();

    if (criterionError) {
      console.error('Database Error: ', criterionError);
      return NextResponse.json(
        { message: 'Error creating criterion' },
        { status: 500 }
      );
    }

    return NextResponse.json(criterion, { status: 201 });
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
