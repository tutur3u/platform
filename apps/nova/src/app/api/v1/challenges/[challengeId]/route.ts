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

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { data: challenge, error } = await supabase
      .from('nova_challenges')
      .select('*')
      .eq('id', challengeId)
      .single();

    if (error) {
      console.error('Database Error: ', error);
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
  const updates = await request.json();

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // Validate required fields
    if (!updates.title || !updates.description || !updates.duration) {
      return NextResponse.json(
        { message: 'Title, description, and duration are required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('nova_challenges')
      .update({
        title: updates.title,
        description: updates.description,
        duration: updates.duration,
      })
      .eq('id', challengeId)
      .select()
      .single();

    if (error) {
      console.error('Database Error: ', error);
      return NextResponse.json(
        { message: 'Error updating challenge' },
        { status: 500 }
      );
    }

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('Unexpected Error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { challengeId } = await params;

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { error } = await supabase
      .from('nova_challenges')
      .delete()
      .eq('id', challengeId);

    if (error) {
      console.error('Database Error: ', error);
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
