import { createPolarClient } from '@tuturuuu/payment/polar/client';
import { createClient } from '@tuturuuu/supabase/next/server';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { createCustomerSessionWithFallback } from '@/utils/customer-session';

export async function POST(_req: NextRequest) {
  const user = await getCurrentSupabaseUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const polar = createPolarClient();
    const supabase = await createClient();

    const session = await createCustomerSessionWithFallback({
      polar,
      supabase,
      userId: user.id,
    });

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
