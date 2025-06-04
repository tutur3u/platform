import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function PATCH(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user)
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const payload = await req.json();

    const allowedFields = ['full_name'];

    const sanitizedPayload = Object.keys(payload)
      .filter((key) => allowedFields.includes(key))
      .reduce(
        (obj, key) => {
          obj[key] = payload[key];
          return obj;
        },
        {} as Record<string, any>
      );

    if (Object.keys(sanitizedPayload).length === 0) {
      return NextResponse.json(
        { message: 'No valid fields to update' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('user_private_details')
      .update(sanitizedPayload)
      .eq('user_id', user.id)
      .select();

    if (error) {
      console.error('Supabase error details:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      return NextResponse.json(
        { message: 'Error updating user', error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ users: data });
  } catch (error) {
    console.error('Request error:', error);
    return NextResponse.json(
      {
        message: 'Error processing request',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
