import { createClient } from '@ncthub/supabase/next/server';
import { NextResponse } from 'next/server';
import { MAX_MEETING_PLANS } from '@/constants/meet-together';

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
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return NextResponse.json(
      { message: 'Please log in to create a plan.' },
      { status: 401 }
    );
  }

  const { count, error: countError } = await supabase
    .from('meet_together_plans')
    .select('*', { count: 'exact', head: true })
    .eq('creator_id', user.id);

  if (countError) {
    console.log(countError);
    return NextResponse.json(
      { message: 'Error checking meet together plan limit' },
      { status: 500 }
    );
  }

  if ((count ?? 0) >= MAX_MEETING_PLANS) {
    return NextResponse.json(
      {
        message: `You have reached the ${MAX_MEETING_PLANS}-plan limit. Please delete an old plan before creating a new one.`,
      },
      { status: 409 }
    );
  }

  const data = await req.json();

  const { data: plan, error } = await supabase
    .from('meet_together_plans')
    .insert({ ...data, creator_id: user.id })
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
