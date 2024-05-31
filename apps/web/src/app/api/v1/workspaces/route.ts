import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }

  const { name } = await req.json();

  const { data, error } = await supabase
    .from('workspaces')
    .insert({
      name,
      creator_id: user.id,
    })
    .select('id')
    .single();

  console.log(data, error);

  if (error)
    return NextResponse.json(
      { message: 'Error creating workspace' },
      { status: 500 }
    );

  return NextResponse.json({ message: 'success', id: data.id });
}
