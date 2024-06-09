import { createAdminClient } from '@/utils/supabase/client';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface Params {
  params: {
    planId: string;
    timeblockId: string;
  };
}

export async function DELETE(
  req: Request,
  { params: { planId, timeblockId: id } }: Params
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
      .eq('plan_id', planId)
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
      .eq('plan_id', planId)
      .eq('id', userId)
      .eq('password_hash', passwordHash)
      .maybeSingle();

    if (!guest)
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const { error } = await sbAdmin
      .from(`meet_together_guest_timeblocks`)
      .delete()
      .eq('plan_id', planId)
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
