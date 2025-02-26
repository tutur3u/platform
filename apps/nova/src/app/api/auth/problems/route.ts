import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createClient();

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      console.error('Auth Error:', authError.message);
      return NextResponse.json(
        { message: 'Authentication error' },
        { status: 500 }
      );
    }

    if (!user?.id) {
      console.warn('Unauthorized access attempt.');
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase.from('nova_challenges').select('*');

    if (error) {
      console.error('Database Error:', error.message);
      return NextResponse.json(
        { message: 'Error fetching challenges', error: error.message },
        { status: 500 }
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { message: 'No challenges found' },
        { status: 404 }
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
