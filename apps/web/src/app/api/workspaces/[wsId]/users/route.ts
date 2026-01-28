import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { enforceSeatLimit } from '@/utils/seat-limits';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId: id } = await params;

  const { data, error } = await supabase
    .from('workspace_users')
    .select('*')
    .eq('ws_id', id);

  if (error)
    return NextResponse.json(
      { message: 'Error fetching workspace users' },
      { status: 500 }
    );

  return NextResponse.json(data);
}

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();
  const data = await req.json();
  const { wsId: id } = await params;

  // Check seat limit BEFORE adding member
  const seatCheck = await enforceSeatLimit(supabase, id);
  if (!seatCheck.allowed) {
    return NextResponse.json(
      {
        error: 'seat_limit_reached',
        message: seatCheck.message,
        seatStatus: seatCheck.status,
      },
      { status: 403 }
    );
  }

  const { error } = await supabase.from('workspace_users').insert({
    ...data,
    ws_id: id,
  });

  if (error)
    return NextResponse.json(
      { message: 'Error creating workspace users' },
      { status: 500 }
    );

  return NextResponse.json({ message: 'success' });
}
