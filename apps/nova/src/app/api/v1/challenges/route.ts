import { createChallengeSchema } from '../schemas';
import { createClient } from '@tuturuuu/supabase/next/server';
import { generateSalt, hashPassword } from '@tuturuuu/utils/crypto';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const enabled = searchParams.get('enabled');

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    let query = supabase.from('nova_challenges').select('*');
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

    return NextResponse.json(challenges, { status: 200 });
  } catch (error) {
    console.error('Unexpected Error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  let body;

  try {
    body = await request.json();
  } catch (error) {
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
      max_attempts: validatedData.maxAttempts,
      max_daily_attempts: validatedData.maxDailyAttempts,
      password_hash: passwordHash,
      password_salt: passwordSalt,
      previewable_at: validatedData.previewableAt,
      open_at: validatedData.openAt,
      close_at: validatedData.closeAt,
    };

    const { data: challenge, error: challengeError } = await supabase
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

    const { error: criteriaError } = await supabase
      .from('nova_challenge_criteria')
      .insert(
        validatedData.criteria.map((criterion) => ({
          ...criterion,
          challenge_id: challenge.id,
        }))
      );

    if (criteriaError) {
      console.error('Database Error when creating criteria:', criteriaError);
      return NextResponse.json(
        { message: 'Error creating criteria' },
        { status: 500 }
      );
    }

    return NextResponse.json(challenge, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      // Zod validation error
      return NextResponse.json(
        { message: 'Validation error', errors: error.errors },
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
