import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

interface Params {
  params: {
    timezoneId: string;
  };
}

export async function PUT(
  req: Request,
  { params: { timezoneId: id } }: Params
) {
  const supabase = createRouteHandlerClient({ cookies });

  const data = await req.json();

  const { error } = await supabase
    .from('meet_together_plans')
    .upsert(data)
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

export async function DELETE(
  _: Request,
  { params: { timezoneId: id } }: Params
) {
  const supabase = createRouteHandlerClient({ cookies });

  const { error } = await supabase
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
