import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { parseTimeFromTimetz } from '@tuturuuu/utils/time-helper';

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

  // Backend validation: ensure end_time is after start_time
  if (data.start_time && data.end_time) {
    const startHour = parseTimeFromTimetz(data.start_time);
    const endHour = parseTimeFromTimetz(data.end_time);

    if (
      startHour !== undefined &&
      endHour !== undefined &&
      endHour <= startHour
    ) {
      return NextResponse.json(
        { message: 'End time must be after start time' },
        { status: 400 }
      );
    }
  }

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
