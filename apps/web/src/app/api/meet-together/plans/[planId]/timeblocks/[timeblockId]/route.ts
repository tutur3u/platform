import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

interface Params {
  params: {
    timeblockId: string;
    userType: string;
  };
}

export async function PUT(
  req: Request,
  { params: { timeblockId: id } }: Params
) {
  const supabase = createRouteHandlerClient({ cookies });

  const data = await req.json();
  const userType = data.userType;

  const { error } = await supabase
    .from(`meet_together_${userType}_timeblocks`)
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
  { params: { timeblockId: id, userType } }: Params
) {
  const supabase = createRouteHandlerClient({ cookies });

  const { error } = await supabase
    .from(`meet_together_${userType}_timeblocks`)
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
