import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    challengeId: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  const supabase = await createClient();
  const { challengeId } = await params;
  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email');

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    let query = supabase
      .from('nova_challenge_whitelists')
      .select('*')
      .eq('challenge_id', challengeId);

    if (email) {
      query = query.eq('email', email);
    }

    const { data: whitelists, error } = await query;

    if (error) {
      console.error('Database Error:', error);
      return NextResponse.json(
        { message: 'Error fetching whitelists' },
        { status: 500 }
      );
    }

    return NextResponse.json(whitelists, { status: 200 });
  } catch (error) {
    console.error('Unexpected Error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, { params }: Params) {
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
    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { message: 'Invalid request body: email is required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('nova_challenge_whitelists')
      .upsert({
        challenge_id: challengeId,
        email: email,
      })
      .select()
      .single();

    if (error) {
      console.error('Database Error:', error);
      return NextResponse.json(
        { message: 'Error adding to whitelist' },
        { status: 500 }
      );
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Unexpected Error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email');
  const { challengeId } = await params;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    if (!email) {
      return NextResponse.json(
        { message: 'Email parameter is required' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('nova_challenge_whitelists')
      .delete()
      .eq('challenge_id', challengeId)
      .eq('email', email);

    if (error) {
      console.error('Database Error:', error);
      return NextResponse.json(
        { message: 'Error removing from whitelist' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: 'Email removed from whitelist successfully' },
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
