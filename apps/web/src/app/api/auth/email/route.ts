import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function PATCH(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user)
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const { email } = await req.json();
  const { error } = await supabase.auth.updateUser({ email });

  if (error) {
    console.error('Error updating email:', error);
    return NextResponse.json(
      { message: 'Error updating user', error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
