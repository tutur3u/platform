import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function GET(_: Request) {
  const supabase = createRouteHandlerClient({ cookies });

  const { data, error } = await supabase
    .from('meet_together_plans')
    .select('*');

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching meet together plans' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });

  const data = await req.json();
  const { data: plan, error } = await supabase
    .from('meet_together_plans')
    .insert(data)
    .select('id')
    .single();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating meet together plan' },
      { status: 500 }
    );
  }

  return NextResponse.json({ id: plan.id, message: 'success' });
}
