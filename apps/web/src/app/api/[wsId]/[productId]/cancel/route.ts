import { api } from '@/lib/polar';
import { createClient } from '@tuturuuu/supabase/next/server';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  req: NextRequest,
  _res: { params: Promise<{ wsId: string; productId: string }> }
) {
  // const supabase = await createClient();

  const user = await getCurrentSupabaseUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { polarSubscriptionId } = await req.json();

  if (!polarSubscriptionId) {
    return NextResponse.json(
      { error: 'Subscription ID is required' },
      { status: 400 }
    );
  }
  // const updatedSubscription = await api.subscriptions.update({
  //   id: polarSubscriptionId,
  //   cancel_at_period_end: true, // This is the user-friendly way to cancel
  // });
  const session = await api.customerSessions.create({
    customerExternalId: '0d03ad59-0f49-4214-8d28-360ad1f27d8d',
  });

  console.log(session, 'Session created for user:', user.id);

  // const result = await api.customerPortal.subscriptions.cancel(
  //   {
  //     customerSession: session.token ?? '',
  //   },
  //   {
  //     id: polarSubscriptionId,
  //   }
  // );

  return NextResponse.json({
    success: true,
    // result: result,
  });
}
