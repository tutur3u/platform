import { createPolarClient } from '@tuturuuu/payment/polar/client';
import { createClient } from '@tuturuuu/supabase/next/server';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { PORT } from '@/constants/common';

export async function POST(request: NextRequest) {
  const BASE_URL =
    process.env.NODE_ENV === 'development'
      ? `http://localhost:${PORT}`
      : 'https://tuturuuu.com';

  const { wsId, productId } = await request.json();

  // Validate that you have the info you need
  if (!productId || !wsId) {
    return NextResponse.json(
      { error: 'Product ID and Workspace ID are required' },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { data: isCreator, error: creatorError } = await supabase.rpc(
    'check_ws_creator',
    { ws_id: wsId }
  );

  if (creatorError) {
    console.error('Error checking workspace creator:', creatorError);
    return NextResponse.json(
      { error: `Error checking creator status: ${creatorError.message}` },
      { status: 500 }
    );
  }

  if (!isCreator) {
    console.error(
      `You are not authorized to create subscription for wsId: ${wsId}`
    );
    return NextResponse.json(
      {
        error: 'Unauthorized: You are not the workspace creator',
      },
      { status: 403 } // Forbidden
    );
  }

  const user = await getCurrentSupabaseUser();

  const { data: userData, error } = await supabase
    .from('users')
    .select('display_name')
    .eq('id', user?.id || '')
    .single();

  if (error) {
    console.error('Error fetching user display name:', error);
    return NextResponse.json(
      { error: 'Error fetching user display name' },
      { status: 500 }
    );
  }

  // HERE is where you add the metadata
  try {
    const polar = createPolarClient();

    const checkoutSession = await polar.checkouts.create({
      products: [productId],
      successUrl: `${BASE_URL}/${wsId}/billing/success?checkoutId={CHECKOUT_ID}`,
      externalCustomerId: user?.id || '',
      metadata: { wsId },
      customerName: userData.display_name,
      customerEmail: user?.email,
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error('Failed to create checkout session:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
