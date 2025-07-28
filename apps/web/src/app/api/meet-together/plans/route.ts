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
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { data: plan, error } = await sbAdmin
    .from('meet_together_plans')
    .insert({ ...data, creator_id: user.id })
    .select('id, where_to_meet')
    .single();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating meet together plan' },
      { status: 500 }
    );
  }

  if (plan.where_to_meet && typeof plan.id === 'string') {
    const { error: pollError } = await sbAdmin.from('polls').insert({
      plan_id: plan.id as string,
      // allow_anonymous_updates: plan.allow_anonymous_updates
      // TODO: fix later after knowing user id can be nullable or not
      creator_id: user.id,
      name: 'Where to Meet?',
    });

    if (pollError) {
      // Optionally: you could choose to roll back the plan here, but most apps just log or show warning.
      console.log(pollError);
      return NextResponse.json(
        {
          id: plan.id,
          message: 'Plan created, but failed to create "where" poll',
        },
        { status: 200 }
      );
    }
  }

  return NextResponse.json({ id: plan.id, message: 'success' });
}
