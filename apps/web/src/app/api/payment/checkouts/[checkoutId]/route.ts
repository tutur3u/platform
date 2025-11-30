import { createPolarClient } from '@tuturuuu/payment/polar/client';
import { type NextRequest, NextResponse } from 'next/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ checkoutId: string }> }
) {
  try {
    const { checkoutId } = await params;

    if (!checkoutId) {
      return NextResponse.json(
        { error: 'Checkout ID is required' },
        { status: 400 }
      );
    }

    const polar = createPolarClient();

    const checkout = await polar.checkouts.get({ id: checkoutId });

    if (!checkout) {
      return NextResponse.json(
        { error: 'Checkout not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(checkout);
  } catch (error) {
    console.error('Failed to fetch checkout:', error);

    return NextResponse.json(
      { error: 'Failed to fetch checkout' },
      { status: 500 }
    );
  }
}
