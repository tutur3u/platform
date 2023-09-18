import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function PUT(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });

  const data = await req.json();

  const { error } = await supabase
    .from('workspace_user_groups_users')
    .upsert(data?.members || [])
    .eq('id', data.id);

  console.log(error);

  if (error)
    return NextResponse.json(
      { message: 'Error migrating workspace members' },
      { status: 500 }
    );

  return NextResponse.json({ message: 'success' });
}
