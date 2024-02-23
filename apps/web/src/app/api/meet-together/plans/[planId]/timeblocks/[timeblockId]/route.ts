import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

interface Params {
  params: {
    timeblockId: string;
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
  req: Request,
  { params: { timeblockId: id } }: Params
) {
  const supabase = createRouteHandlerClient({ cookies });

  const data = await req.json();

  const guestId = data.guestId;
  const passwordHash = data.passwordHash;

  if (guestId && !passwordHash)
    return NextResponse.json(
      { message: 'Password hash required for guest timeblocks' },
      { status: 400 }
    );

  if (passwordHash && !guestId)
    return NextResponse.json(
      { message: 'Guest id required for password hash' },
      { status: 400 }
    );

  const userType = guestId ? 'guest' : 'user';

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (userType === 'user' && !user)
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const userId = userType === 'user' ? user?.id : guestId;

  const { error } = await supabase
    .from(`meet_together_${userType}_timeblocks`)
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting meet together plan' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
