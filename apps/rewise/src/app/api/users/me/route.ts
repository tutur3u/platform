import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function PATCH(req: Request) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user)
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const payload = await req.json();

  const { data, error } = await supabase
    .from('users')
    .update(payload)
    .eq('id', user.id);

  if (error)
    return NextResponse.json(
      { message: 'Error updating user' },
      { status: 500 }
    );

  return NextResponse.json({ users: data });
}
