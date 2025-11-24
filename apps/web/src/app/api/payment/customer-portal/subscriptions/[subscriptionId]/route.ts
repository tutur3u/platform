import { createPolarClient } from '@tuturuuu/payment/polar/client';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import { type NextRequest, NextResponse } from 'next/server';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ subscriptionId: string }> }
) {
  const user = await getCurrentSupabaseUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { subscriptionId } = await params;

  if (!subscriptionId) {
    return NextResponse.json(
      { error: 'Subscription ID is required' },
      { status: 400 }
    );
  }

  const polarClient = createPolarClient({
    sandbox: process.env.NODE_ENV === 'development',
  });

  const session = await polarClient.customerSessions.create({
    externalCustomerId: user.id,
  });

  const result = await polarClient.customerPortal.subscriptions.cancel(
    {
      customerSession: session.token,
    },
    {
      id: subscriptionId,
    }
  );

  return NextResponse.json({
    success: true,
    result,
  });
}
