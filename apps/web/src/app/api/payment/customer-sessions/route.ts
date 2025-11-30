import { createPolarClient } from '@tuturuuu/payment/polar/client';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import { type NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const user = await getCurrentSupabaseUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Parse request body
    const body = await req.json();
    const { sandbox } = body;

    const polar = createPolarClient({
      sandbox: sandbox || process.env.NODE_ENV === 'development',
    });

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
