import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { generateSalt, hashPassword } from '@tuturuuu/utils/crypto';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    challengeId: string;
  }>;
}

export async function GET(_request: Request, { params }: Params) {
  const { challengeId } = await params;

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const sbAdmin = await createAdminClient();

  try {
    const { data: challenge, error } = await sbAdmin
      .from('nova_challenges')
      .select(
        'id, title, description, enabled, open_at, close_at, previewable_at, duration, max_attempts, max_daily_attempts'
      )
      .eq('id', challengeId)
      .single();

    if (error) {
      console.error('Database Error: ', error);
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { message: 'Challenge not found' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { message: 'Error fetching challenge' },
        { status: 500 }
      );
    }

    return NextResponse.json(challenge, { status: 200 });
  } catch (error) {
    console.error('Unexpected Error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request, { params }: Params) {
  const supabase = await createClient();
  const { challengeId } = await params;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    title?: string;
    description?: string;
    duration?: number;
    enabled?: boolean;
    whitelistedOnly?: boolean;
    maxAttempts?: number;
    maxDailyAttempts?: number;
    password?: string;
    previewableAt?: string;
    openAt?: string;
    closeAt?: string;
  };

  try {
    body = await request.json();

    // Check if any update data was provided
    if (Object.keys(body).length === 0) {
      return NextResponse.json(
        { message: 'No update data provided' },
        { status: 400 }
      );
    }
  } catch (_error) {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }

  try {
    const updateData: Record<string, unknown> = {};

    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined)
      updateData.description = body.description;
    if (body.duration !== undefined) updateData.duration = body.duration;
    if (body.enabled !== undefined) updateData.enabled = body.enabled;
    if (body.whitelistedOnly !== undefined)
      updateData.whitelisted_only = body.whitelistedOnly;

    if (body.maxAttempts !== undefined)
      updateData.max_attempts = body.maxAttempts;
    if (body.maxDailyAttempts !== undefined)
      updateData.max_daily_attempts = body.maxDailyAttempts;

    if (body.password !== undefined) {
      if (body.password !== null) {
        const passwordSalt = generateSalt();
        const passwordHash = await hashPassword(body.password, passwordSalt);
        updateData.password_hash = passwordHash;
        updateData.password_salt = passwordSalt;
      } else {
        updateData.password_hash = null;
        updateData.password_salt = null;
      }
    }

    if (body.previewableAt !== undefined)
      updateData.previewable_at = body.previewableAt;
    if (body.openAt !== undefined) updateData.open_at = body.openAt;
    if (body.closeAt !== undefined) updateData.close_at = body.closeAt;

    const { data: updatedChallenge, error: updateError } = await supabase
      .from('nova_challenges')
      .update(updateData)
      .eq('id', challengeId)
      .select()
      .single();

    if (updateError) {
      console.error('Database Error: ', updateError);
      if (updateError.code === 'PGRST116') {
        return NextResponse.json(
          { message: 'Challenge not found' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { message: 'Error updating challenge' },
        { status: 500 }
      );
    }

    return NextResponse.json(updatedChallenge, { status: 200 });
  } catch (error) {
    console.error('Unexpected Error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const supabase = await createClient();
  const { challengeId } = await params;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { error: deleteError } = await supabase
      .from('nova_challenges')
      .delete()
      .eq('id', challengeId);

    if (deleteError) {
      console.error('Database Error: ', deleteError);
      return NextResponse.json(
        { message: 'Error deleting challenge' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: 'Challenge deleted successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Unexpected Error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
