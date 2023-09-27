import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function PUT(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });

  const data = await req.json();

  const { error } = await supabase
    .from('user_feedbacks')
    .upsert(data?.feedbacks || [])
    .eq('id', data.id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error migrating user feedbacks' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
