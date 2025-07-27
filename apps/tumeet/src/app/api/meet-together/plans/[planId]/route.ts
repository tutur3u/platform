import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    planId: string;
  }>;
}

// Utility function to parse time from timetz format (e.g., "09:00:00+00")
const parseTimeFromTimetz = (
  timetz: string | undefined
): number | undefined => {
  if (!timetz) return undefined;
  const timePart = timetz.split(':')[0];
  if (!timePart) return undefined;
  const hour = parseInt(timePart, 10);
  // Convert 0 to 24 for comparison (which uses 1-24 format)
  return hour === 0 ? 24 : hour;
};

export async function PUT(req: Request, { params }: Params) {
  const sbAdmin = await createAdminClient();
  const { planId: id } = await params;

  const data = await req.json();

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

  const { error } = await sbAdmin
    .from('meet_together_plans')
    .update(data)
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating meet together plan' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(_: Request, { params }: Params) {
  const sbAdmin = await createAdminClient();
  const { planId: id } = await params;

  const { error } = await sbAdmin
    .from('meet_together_plans')
    .delete()
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting meet together plan' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
