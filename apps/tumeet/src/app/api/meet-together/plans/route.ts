import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
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
  console.log('Creating plan with data:', data);
  
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  console.log('User:', user?.id);

  const { data: plan, error } = await sbAdmin
    .from('meet_together_plans')
    .insert({ ...data, creator_id: user?.id })
    .select('id')
    .single();

  if (error) {
    console.error('Database error creating plan:', error);
    return NextResponse.json(
      { message: 'Error creating meet together plan', error: error.message },
      { status: 500 }
    );
  }

  console.log('Plan created successfully:', plan);
  return NextResponse.json({ id: plan.id, message: 'success' });
}
