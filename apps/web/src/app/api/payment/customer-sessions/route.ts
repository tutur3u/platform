import { createPolarClient } from '@tuturuuu/payment/polar/client';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import { type NextRequest, NextResponse } from 'next/server';

export async function POST(_req: NextRequest) {
  const user = await getCurrentSupabaseUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const polar = createPolarClient();

    // Create customer session to get portal URL
    const session = await polar.customerSessions.create({
      externalCustomerId: user.id,
    });

    // Return the customer portal URL
    return NextResponse.json({
      success: true,
      customerPortalUrl: session.customerPortalUrl,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to create customer portal session',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
