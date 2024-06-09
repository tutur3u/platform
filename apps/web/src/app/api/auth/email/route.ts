import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user)
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const { email } = await req.json();
  const { error } = await supabase.auth.updateUser({ email });

  if (error)
    return NextResponse.json(
      { message: 'Error updating user' },
      { status: 500 }
    );

  return NextResponse.json({ message: 'success' });
}
