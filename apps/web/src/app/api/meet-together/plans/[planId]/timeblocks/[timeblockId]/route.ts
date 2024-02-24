import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/utils/supabase/client';

export const dynamic = 'force-dynamic';

interface Params {
  params: {
    timeblockId: string;
  };
}

export async function DELETE(
  req: Request,
  { params: { timeblockId: id } }: Params
) {
  const supabase = createRouteHandlerClient({ cookies });

  const data = await req.json();

  const passwordHash = data.password_hash;
  const userType = passwordHash ? 'guest' : 'user';

  if (userType === 'user') {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user)
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const userId = user?.id;

    const { error } = await supabase
      .from(`meet_together_user_timeblocks`)
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.log(error);
      return NextResponse.json(
        { message: 'Error deleting timeblock' },
        { status: 500 }
      );
    }
  } else {
    const sbAdmin = createAdminClient();
    if (!sbAdmin)
      return NextResponse.json(
        { message: 'Internal Server Error' },
        { status: 500 }
      );

    const userId = data.user_id;

    const { data: guest } = await sbAdmin
      .from('meet_together_guests')
      .select('id')
      .eq('id', userId)
      .eq('password_hash', passwordHash)
      .maybeSingle();

    if (!guest)
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const { error } = await sbAdmin
      .from(`meet_together_guest_timeblocks`)
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.log(error);
      return NextResponse.json(
        { message: 'Error deleting timeblock' },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ message: 'success' });
}
