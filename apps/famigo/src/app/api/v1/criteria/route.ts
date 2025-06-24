import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { createCriterionSchema } from '../schemas';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const challengeId = searchParams.get('challengeId');

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const sbAdmin = await createAdminClient();

  try {
    let query = sbAdmin.from('nova_challenge_criteria').select('*');
    if (challengeId) {
      query = query.eq('challenge_id', challengeId);
    }

    const { data: criteria, error } = await query;

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
  } catch (_error) {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }

  try {
    // Validate request body with Zod
    const validatedData = createCriterionSchema.parse(body);

    const criterionData = {
      challenge_id: validatedData.challengeId,
      name: validatedData.name,
      description: validatedData.description,
    };

    const { data: criterion, error: criterionError } = await supabase
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
