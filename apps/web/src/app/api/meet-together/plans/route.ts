import { createAdminClient, createClient } from '@ncthub/supabase/next/server';
import { NextResponse } from 'next/server';

export async function GET(_: Request) {
  const supabase = await createClient();

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
  const sbAdmin = await createAdminClient();

  const data = await req.json();
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: plan, error } = await sbAdmin
    .from('meet_together_plans')
    .insert({ ...data, creator_id: user?.id })
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
